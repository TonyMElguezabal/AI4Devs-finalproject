import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "@playwright/test";
import { ALL_STUBS_SUCCEEDING } from "../backend/test/workflowServer.ts";

// add-browser-e2e (JOS-272), design Decisions 2-3: the real backend on scratch folders with every provider stubbed, and the
// real Vite frontend pointed at it. Fixed ports, and never an already running server: a stray one on 5173 or 3101 must fail
// the run, not become the system under test.
const BACKEND_PORT = 3101;
const FRONTEND_PORT = 5173; // the backend's origin policy allows this origin whatever its own port
// Workers load this file too and inherit the variable, so the whole run shares one folder; globalTeardown removes it.
const scratch = (process.env.E2E_SCRATCH ??= mkdtempSync(join(tmpdir(), "vid4you-e2e-")));

export default defineConfig({
  testDir: "tests",
  timeout: 90_000,
  globalTeardown: "./teardown.ts",
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: `http://127.0.0.1:${FRONTEND_PORT}`, trace: "retain-on-failure", acceptDownloads: true },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: [
    {
      command: "node src/server.ts",
      cwd: "../backend",
      url: `http://127.0.0.1:${BACKEND_PORT}/health`,
      reuseExistingServer: false,
      env: {
        ...ALL_STUBS_SUCCEEDING,
        NODE_ENV: "development",
        PORT: String(BACKEND_PORT),
        DB_PATH: join(scratch, "db.sqlite"),
        PROJECTS_ROOT: join(scratch, "projects"),
        SETTINGS_PATH: join(scratch, "settings.json"),
        SECRETS_PATH: join(scratch, "secrets.json"),
        VID4YOU_TELEMETRY_ENDPOINT: "http://127.0.0.1:9",
        RETRY_BASE_DELAY_SECONDS: "0",
        RETRY_CAP_DELAY_SECONDS: "0",
      },
    },
    {
      command: "npm run dev -- --host 127.0.0.1",
      cwd: "../frontend",
      url: `http://127.0.0.1:${FRONTEND_PORT}`,
      reuseExistingServer: false,
      env: { VITE_API_BASE: `http://127.0.0.1:${BACKEND_PORT}` },
    },
  ],
});
