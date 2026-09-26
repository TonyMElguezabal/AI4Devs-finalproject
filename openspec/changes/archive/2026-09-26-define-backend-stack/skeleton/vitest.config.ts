import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    fileParallelism: false, // all tests share one SQLite file; keep them sequential
  },
});
