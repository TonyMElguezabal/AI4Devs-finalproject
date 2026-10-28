# Vid4You backend

Fastify + Zod API and stage orchestrator for Vid4You (TypeScript run natively by Node 24+, SQLite through `node:sqlite`). The product overview, installation, configuration, API and troubleshooting are in the repository `readme.md`; the contracts are in `docs/api-spec.yml`; the stack decisions are in `docs/adr/`.

## Commands

```bash
npm ci
npm start           # API on http://127.0.0.1:3100 (PORT), docs at /docs, health at /health
npm run typecheck   # tsc --noEmit
npm test            # vitest run (no real provider is ever called; test/setup.ts installs stubs)
```

Voice-over generation and the final assembly need `ffmpeg` and `ffprobe` (`FFMPEG_PATH` / `FFPROBE_PATH`, `/opt/homebrew/bin`, or the `PATH`). The `ffmpeg` must have libass (the `subtitles` filter, which draws the burned-in subtitles of the final video): check with `ffmpeg -filters | grep subtitles`. Without it every assembly fails as not retryable and the backend logs a warning at start-up; point `FFMPEG_PATH` at a build that has it (the pinned `eugeneware/ffmpeg-static` b6.0 does).

Opt-in contract tests that call the real providers (keys from the environment or `.secrets.json`):

```bash
RUN_PROVIDER_CONTRACT_TESTS=1 npx vitest run test/voice-provider.contract.test.ts
```

## Layout

- `src/server.ts` builds the app; `src/routes.ts` holds the HTTP surface; `src/orchestrator.ts` the session and scene state machine, boot recovery and assembly; `src/launchGate.ts` the phase-launch gate (pause, request caps, retries).
- `src/retry/` the retry policy, scheduler and per-attempt time limit; `src/config/` providers, limits, credentials and ffmpeg paths; `src/telemetry/` the opt-in telemetry.
- `src/db.ts` the SQLite schema and migrations (`docs/data-model.md`).

## Environment

`PORT` (3100), `DB_PATH` (`data/skeleton.sqlite`), `PROJECTS_ROOT` (`data/projects`), `CORS_ALLOWED_ORIGINS`, `FFMPEG_PATH`, `FFPROBE_PATH`, `SUBTITLE_FONT_PATH`, and the test-only `ALLOW_TEST_ENDPOINTS`, `USE_STUB_VOICE_PROVIDER`, `USE_STUB_VIDEO_PROVIDER`, `USE_STUB_IMAGE_PROVIDER`, `RETRY_BASE_DELAY_SECONDS`, `RETRY_CAP_DELAY_SECONDS`, `STAGE_CONCURRENCY_LIMIT`. The full table is in the root `readme.md`.

## Restarting

A restart is safe mid-processing: the store keeps every session, scene, result and error; interrupted requests are awaited or recorded as failed attempts; pending work continues without user action; paused sessions stay paused. The boot log line `boot recovery complete` summarizes what was resumed. See `docs/backend-standards.md`, *Restart recovery*, and `openspec/specs/restart-recovery/spec.md`.

Data lives under `data/` (git-ignored). Delete it to reset.
