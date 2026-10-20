import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./test/setup.ts"],
    fileParallelism: false, // all tests share one SQLite file; keep them sequential
    testTimeout: 20_000, // CI runners are slower than a laptop; the default 5 s flaked timing-based tests
  },
});
