// Lint rules for the API. Type-aware so floating promises and unsafe any are caught.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "coverage/**", "eslint.config.mjs", "scripts/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.jest },
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-extraneous-class": "off",
      "no-restricted-globals": ["error", { name: "parseFloat", message: "Money is integer kobo. Never parse a float." }],
      "no-restricted-properties": [
        "error",
        { object: "Number", property: "parseFloat", message: "Money is integer kobo. Never parse a float." },
      ],
    },
  },
  {
    files: ["**/*.spec.ts", "test/**/*.ts"],
    rules: {
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/unbound-method": "off",
    },
  },
);
