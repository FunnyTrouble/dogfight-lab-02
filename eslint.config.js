import js from "@eslint/js";

export default [
  js.configs.recommended,
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        window: "readonly",
        document: "readonly",
        performance: "readonly",
        requestAnimationFrame: "readonly",
        cancelAnimationFrame: "readonly",
        console: "readonly",
        Set: "readonly",
        Math: "readonly",
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
