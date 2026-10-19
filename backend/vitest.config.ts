import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./test/setup.ts"],
    // configure-providers-and-parameters (JOS-174): a settings override left in `data/` must not change a test's outcome,
    // so every test reads the shipped defaults unless it points `SETTINGS_PATH` somewhere itself.
    env: { SETTINGS_PATH: "data/no-settings-override-in-tests.json" },
    fileParallelism: false, // all tests share one SQLite file; keep them sequential
  },
});
