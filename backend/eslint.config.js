// Lint rules for the backend (JOS-208): type-aware typescript-eslint recommended set, scoped to src and test.
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["node_modules", "data", "public", "eslint.config.js", "vitest.config.ts"] },
  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    linterOptions: { reportUnusedDisableDirectives: "error" },
    rules: {
      // A leading underscore marks a parameter that a callback signature forces but the body does not use.
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }],
    },
  },
  {
    // Tests poke at untyped mocks, parsed response bodies and deliberately malformed input, so the type-safety
    // family cannot be satisfied without casting every assertion. Still enforced in src/.
    files: ["test/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      // Stubs and test callbacks are async to satisfy the provider and vitest signatures, with nothing to await.
      "@typescript-eslint/require-await": "off",
      // Fetch stubs stringify the URL and request body they are always given as strings, and deliberately reject with non-Errors.
      "@typescript-eslint/no-base-to-string": "off",
      "@typescript-eslint/prefer-promise-reject-errors": "off",
    },
  },
);
