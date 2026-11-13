import js from "@eslint/js";

export default [
  { ignores: ["**/node_modules/**", "client/dist/**", "server/logs/**"] },
  js.configs.recommended,
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        window: "readonly", document: "readonly", navigator: "readonly", location: "readonly", Image: "readonly", Audio: "readonly", AudioContext: "readonly", DOMException: "readonly", EventTarget: "readonly", CustomEvent: "readonly", AbortController: "readonly", AbortSignal: "readonly", fetch: "readonly", URL: "readonly", Blob: "readonly", createImageBitmap: "readonly", setTimeout: "readonly", clearTimeout: "readonly", setInterval: "readonly", clearInterval: "readonly", requestAnimationFrame: "readonly", cancelAnimationFrame: "readonly", performance: "readonly", console: "readonly", Math: "readonly", Map: "readonly", Set: "readonly", Promise: "readonly", Object: "readonly", Array: "readonly", Number: "readonly", String: "readonly", Error: "readonly", JSON: "readonly", ArrayBuffer: "readonly", WebSocket: "readonly", Buffer: "readonly", process: "readonly", URLSearchParams: "readonly", structuredClone: "readonly", queueMicrotask: "readonly", Intl: "readonly", TextDecoder: "readonly", TextEncoder: "readonly", setImmediate: "readonly", clearImmediate: "readonly", global: "readonly", __dirname: "readonly", require: "readonly", module: "readonly", exports: "readonly", NodeJS: "readonly", ReadableStream: "readonly", WritableStream: "readonly", TransformStream: "readonly"
      }
    },
    rules: { "no-unused-vars": "error" }
  }
];
