## Why

The stubbed end-to-end test (`backend/test/workflow-end-to-end.test.ts`, JOS-243) proves a session reaches `final-video` through the HTTP API, but nothing automated drives the user interface. Browser-level checks are manual (Playwright MCP, one report per change), so a regression in the page, in how it calls the API or in the live progress updates is found only by hand. The course deliverable also asks for E2E tests, and CI should repeat them on every pull request.

## What Changes

- Add a Playwright test package, `e2e/`, with one browser test: open the page, create a session from a title, a script and a language, watch it reach the final video, and download it.
- The test runs against the real backend with every provider stubbed (the same `USE_STUB_*` variables and scratch folders as `backend/test/workflowServer.ts`) and the real Vite frontend. Nothing reads or writes the developer's `data/` or `.secrets.json`, and no provider is called.
- Add an `e2e` job to `.github/workflows/ci.yml` that installs Chromium and runs the test on every pull request and push, next to the existing `test` and `secrets` jobs.
- Document the test in `readme.md` §2.6 and `docs/development_guide.md`.

Non-goals: more than one happy-path scenario, visual regression, cross-browser runs, the admin page, real providers, and the packaged executable.

## Capabilities

### New Capabilities
- `browser-e2e-verification`: a repeatable browser test of the User's main flow against stubbed providers, run in CI.

### Modified Capabilities

None. No product behavior changes.

## Impact

- New: `e2e/` (package.json, lockfile, `playwright.config.ts`, one spec). New dev dependency `@playwright/test`, isolated in `e2e/`, so the backend and frontend lockfiles do not change.
- Changed: `.github/workflows/ci.yml` (one job, about a minute longer for the Chromium download), `readme.md`, `docs/development_guide.md`, `.gitignore` (Playwright output).
- No backend or frontend source change expected; if the page lacks a stable way to select an element, the smallest fix (an accessible name or a `data-testid`) is made in the frontend and noted in the tasks.
