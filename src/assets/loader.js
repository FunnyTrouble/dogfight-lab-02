const DEFAULT_ATTEMPTS = 3;
const DEFAULT_BASE_MS = 300;

function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(
        signal.reason ??
          new DOMException("Operation aborted", "AbortError"),
      );
      return;
    }

    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    function onAbort() {
      clearTimeout(timer);
      reject(
        signal.reason ??
          new DOMException("Operation aborted", "AbortError"),
      );
    }

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function withRetry(
  operation,
  {
    attempts = DEFAULT_ATTEMPTS,
    baseMs = DEFAULT_BASE_MS,
    signal,
  } = {},
) {
  for (let attempt = 0; ; attempt += 1) {
    if (signal?.aborted) {
      throw (
        signal.reason ??
        new DOMException("Operation aborted", "AbortError")
      );
    }

    try {
      return await operation(signal);
    } catch (error) {
      const status = error.status;
      const permanentHttpError =
        Number.isInteger(status) && status >= 400 && status < 500;

      const isCancellation =
        error.name === "AbortError" ||
        error.name === "TimeoutError" ||
        signal?.aborted;

      if (
        permanentHttpError ||
        isCancellation ||
        attempt >= attempts - 1
      ) {
        throw error;
      }

      const backoff = baseMs * 2 ** attempt;
      const jitter = Math.random() * baseMs;

      await delay(backoff + jitter, signal);
    }
  }
}

export async function fetchJson(url, signal) {
  const response = await fetch(url, { signal });

  if (!response.ok) {
    const error = new Error(
      `Request failed: ${response.status} ${response.statusText}`,
    );
    error.status = response.status;
    throw error;
  }

  return response.json();
}

export async function loadImage(url, signal) {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    const error = new Error(`Image request failed: ${response.status} ${response.statusText}`);
    error.status = response.status;
    throw error;
  }
  const blob = await response.blob();
  if (signal?.aborted) {
    throw signal.reason ?? new DOMException("Image loading aborted", "AbortError");
  }
  const objectUrl = URL.createObjectURL(blob);
  try {
    return await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Failed to decode image: ${url}`));
      image.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function loadAudio(audioContext, url, signal) {
  const response = await fetch(url, { signal });

  if (!response.ok) {
    const error = new Error(`Audio request failed: ${response.status}`);
    error.status = response.status;
    throw error;
  }

  const data = await response.arrayBuffer();

  if (signal?.aborted) {
    throw (
      signal.reason ??
      new DOMException("Audio loading aborted", "AbortError")
    );
  }

  return audioContext.decodeAudioData(data);
}

export function loadJson(url, signal) {
  return withRetry(
    (currentSignal) => fetchJson(url, currentSignal),
    { signal },
  );
}

export function loadImageWithRetry(url, signal) {
  return withRetry(
    (currentSignal) => loadImage(url, currentSignal),
    { signal },
  );
}

export function loadAudioWithRetry(audioContext, url, signal) {
  return withRetry(
    (currentSignal) => loadAudio(audioContext, url, currentSignal),
    { signal },
  );
}

export async function loadAll(
  manifest,
  { onProgress = () => {}, signal, audioContext } = {},
) {
  const entries = Object.entries(manifest);
  const total = entries.length;
  let completed = 0;

  onProgress({
    completed,
    total,
    ratio: total === 0 ? 1 : 0,
    current: null,
    status: "loading",
  });

  const results = await Promise.all(
    entries.map(async ([name, asset]) => {
      try {
        if (signal?.aborted) {
          throw (
            signal.reason ??
            new DOMException("Loading aborted", "AbortError")
          );
        }

        let value;

        if (asset.type === "image") {
          value = await loadImageWithRetry(asset.url, signal);
        } else if (asset.type === "json") {
          value = await loadJson(asset.url, signal);
        } else if (asset.type === "audio") {
          if (!audioContext) {
            throw new Error("AudioContext is required for audio assets");
          }

          value = await loadAudioWithRetry(
            audioContext,
            asset.url,
            signal,
          );
        } else {
          throw new Error(`Unknown asset type: ${asset.type}`);
        }

        return { name, value, error: null };
      } catch (error) {
        return { name, value: null, error };
      } finally {
        completed += 1;

        onProgress({
          completed,
          total,
          ratio: total === 0 ? 1 : completed / total,
          current: name,
          status: "loading",
        });
      }
    }),
  );

  const assets = {};
  const errors = [];

  for (const result of results) {
    if (result.error) {
      errors.push({
        name: result.name,
        error: result.error,
      });
    } else {
      assets[result.name] = result.value;
    }
  }

  return {
    assets,
    errors,
    success: errors.length === 0,
  };
}
