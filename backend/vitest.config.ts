import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    // JOS-277: `npm run coverage` measures the code under src/ (V8, no instrumentation); the floor is just under the 2026-11-10 measure (backend 95.7%, frontend 97.5%), so a drop fails the run.
    coverage: { provider: "v8", include: ["src/**/*.{ts,tsx}"], exclude: ["src/**/*.d.ts"], reporter: ["text-summary", "html"], thresholds: { statements: 94, lines: 94 } },
    environment: "node",
    setupFiles: ["./test/setup.ts"],
    // configure-providers-and-parameters (JOS-174): a settings override left in `data/` must not change a test's outcome,
    // so every test reads the shipped defaults unless it points `SETTINGS_PATH` somewhere itself.
    env: { SETTINGS_PATH: "data/no-settings-override-in-tests.json" },
    fileParallelism: false, // all tests share one SQLite file; keep them sequential
    testTimeout: 20_000, // CI runners are slower than a laptop; the default 5 s flaked timing-based tests
  },
});
