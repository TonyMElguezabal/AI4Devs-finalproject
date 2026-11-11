# ADR 0013 — Automated test layers in CI (JOS-243, JOS-272, JOS-275, JOS-277, JOS-279)

- Status: Accepted (2026-11-04 to 2026-11-11)
- Date: 2026-11-11
- Changes: `verify-internal-workflow`, `add-browser-e2e`, `add-package-smoke-ci` and the API-spec and coverage tickets (archived under `openspec/changes/archive/`)

## Context

Real providers cost money and are slow, so CI never calls them. The risk is a change that passes unit tests but breaks the flow end to end, the packaged executable or the API contract.

## Decision

Each layer runs on stubbed providers and has one job:

| Layer | What it proves | Where |
|---|---|---|
| Unit and integration (vitest) with a coverage floor (backend 94 %, frontend 96 %, statements and lines) | Logic and store behaviour | `test` job |
| API-level workflow E2E: the real `node src/server.ts` on temporary folders with every provider stubbed | A session reaches `final-video` through HTTP | `backend/test/workflow-end-to-end.test.ts`, `test` job |
| API contract: `docs/api-spec.yml` against the registered routes | No undocumented route, no documented route without code | `backend/test/api-spec-routes.test.ts` |
| Browser E2E (Playwright, Chromium, its own `e2e/` package): start form to downloaded video, on port 3101 so a developer's server is never reused; role- and label-based selectors | The interface drives the whole flow | `e2e` job |
| Packaged-executable smoke test on macOS: the smoke variant (stub providers) started on port 3102, one session to `final-video` | The bundled build starts and works | `package-smoke.yml`, on PRs that touch `backend/` or `frontend/` |
| Provider contract tests (`RUN_PROVIDER_CONTRACT_TESTS=1`) | The real provider APIs still answer as expected | Manual, never in CI |

## Consequences

- Coverage counts executed lines, not test quality, and does not count the child processes the E2E tests start.
- A change in a real provider API is found only by a manual contract run.
- The smoke run proves macOS only; the Windows executable was run once by hand (JOS-194).
