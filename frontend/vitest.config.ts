import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    // JOS-277: `npm run coverage` measures the code under src/ (V8, no instrumentation); the floor is just under the 2026-11-10 measure (backend 95.7%, frontend 97.5%), so a drop fails the run.
    coverage: { provider: "v8", include: ["src/**/*.{ts,tsx}"], exclude: ["src/**/*.d.ts", "src/main.tsx", "src/vite-env.d.ts"], reporter: ["text-summary", "html"], thresholds: { statements: 96, lines: 96 } },
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
  },
});
