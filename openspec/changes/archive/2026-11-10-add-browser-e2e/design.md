## Context

- The backend (`node src/server.ts`) reads every stub from `USE_STUB_*` variables, and `backend/test/workflowServer.ts` already holds the working set (`ALL_STUBS_SUCCEEDING`) and the scratch-folder variables (`DB_PATH`, `PROJECTS_ROOT`, `SETTINGS_PATH`, `SECRETS_PATH`, zero retry delays, a telemetry endpoint that goes nowhere).
- In development the backend's `/` serves a placeholder page, not the React app. The React app runs on Vite (`frontend`, port 5173, `strictPort`) and calls the backend at `VITE_API_BASE`, default `http://127.0.0.1:3100`.
- The backend's origin policy accepts the Origin `http://127.0.0.1:5173` and `http://localhost:5173` whatever its own port, so the dev frontend can call a backend on any port.
- CI pins every action by SHA and runs Node 24; the backend job installs ffmpeg because the voice stub's audio is validated with ffprobe.

## Goals / Non-Goals

**Goals:** one repeatable, hermetic browser test of the happy path in CI; no change to the product; no new dependency in `backend/` or `frontend/`.

**Non-Goals:** failure scenarios (the API-level `workflow-stage-failure.test.ts` covers them), other browsers, the packaged build, the admin page.

## Decisions

1. **Playwright Test, in its own `e2e/` package.** It is the runner the team already uses by hand through the MCP, drives a real browser, waits on conditions instead of sleeping, and keeps the browser dependency out of the two product packages. Alternatives: Cypress (heavier, a second tool), a vitest + jsdom test (already exists in `frontend/test`; it is not a browser and does not cross the real network).
2. **Playwright `webServer` starts both servers.** Backend: `node src/server.ts` in `backend/` on a fixed port (3101, so a developer's own 3100 server is never reused), env from `ALL_STUBS_SUCCEEDING` imported from `backend/test/workflowServer.ts` plus a scratch folder made with `mkdtempSync` in the config. Frontend: `npm run dev` in `frontend/` with `VITE_API_BASE=http://127.0.0.1:3101`, port 5173. `reuseExistingServer` is `false`, so a stray server on 5173 fails loudly rather than the test running against the wrong backend. Alternative: reuse `startWorkflowServer` from a global setup; rejected because it spawns on port 0 and the frontend must know the port before it starts.
3. **The script is `WORKFLOW_SCRIPT`**, exported from the same file: the stub voice's timestamps must end within the narration, which caps the script at 19 characters.
4. **Assertions follow what the User sees**: the start form submits, the page shows the session's progress, the four phases end as complete, and the final video link downloads a non-empty file. The wait is Playwright's auto-retrying `expect(...).toBeVisible({ timeout })`, bounded at 60 s like the API test.
5. **Selectors are role- and label-based.** If the page lacks an accessible name for a needed element, add the name in the frontend rather than a CSS selector.
6. **CI job `e2e`** with `ubuntu-latest`, Node 24, ffmpeg, `npm ci` in `backend`, `frontend` and `e2e`, `npx playwright install --with-deps chromium`, `npm test` in `e2e`. Action SHAs are the ones `ci.yml` already pins. On failure the Playwright report and trace are uploaded as an artifact (`if: failure()`, short retention).

## Risks / Trade-offs

- [Flaky timing] → every wait is a condition with a bound; retries stay 0 locally and 1 in CI, and a retry is visible in the report.
- [Port 3101 or 5173 busy] → `reuseExistingServer: false` fails with the port in the message; documented in the development guide.
- [A second copy of the stub env] → imported from `workflowServer.ts`, so adding a stub there updates both.
- [CI minutes] → one job, in parallel with `test`; about one extra minute for Chromium.
