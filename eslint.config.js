
import js from "@eslint/js";

export default [
  js.configs.recommended,
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        // Browser API
        window: "readonly",
        document: "readonly",
        navigator: "readonly",
        location: "readonly",
        Image: "readonly",
        Audio: "readonly",
        AudioContext: "readonly",
        DOMException: "readonly",
        EventTarget: "readonly",
        CustomEvent: "readonly",
        AbortController: "readonly",
        AbortSignal: "readonly",
        fetch: "readonly",
        URL: "readonly",
        Blob: "readonly",
        createImageBitmap: "readonly",

        // Timers and animation
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        requestAnimationFrame: "readonly",
        cancelAnimationFrame: "readonly",
        performance: "readonly",

        // JavaScript built-ins and debugging
        console: "readonly",
        Math: "readonly",
        Set: "readonly",
        Map: "readonly",
        Promise: "readonly",
        Object: "readonly",
        Array: "readonly",
        Number: "readonly",
        String: "readonly",
        Error: "readonly",
        JSON: "readonly",
        Date: "readonly",
        ArrayBuffer: "readonly",
      },
    },
    rules: {
      "no-unused-vars": "error",
    },
  },
  {
    ignores: ["dist/**", "node_modules/**"],
  },
];
