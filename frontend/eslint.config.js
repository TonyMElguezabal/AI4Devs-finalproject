// Lint rules for the frontend (JOS-208): type-aware typescript-eslint recommended set plus the React Hooks rules.
import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["node_modules", "dist", "eslint.config.js"] },
  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  reactHooks.configs.flat.recommended,
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
    // Tests poke at untyped mocks, parsed request bodies and stubbed fetches, so the type-safety family cannot be
    // satisfied without casting every assertion. Still enforced in src/.
    files: ["test/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      // Stubs and test callbacks are async to satisfy fetch and vitest signatures, with nothing to await.
      "@typescript-eslint/require-await": "off",
      // Fetch stubs stringify the request body they are always given as a string.
      "@typescript-eslint/no-base-to-string": "off",
    },
  },
);
