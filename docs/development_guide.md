# Development Guide

How to run Vid4You locally, test it, and how code moves from a feature branch to the UAT and production environments.

Vid4You is two packages in one repository: `backend/` (Fastify, `node:sqlite`, TypeScript run directly by Node with no build step) and `frontend/` (React and Vite). Product rules are in `docs/PRD.md`; backend and frontend conventions are in `docs/backend-standards.md` and `docs/frontend-standards.md`.

## Prerequisites

- **Node.js 26.4.0**, the version the repository is developed and tested with. The backend needs a release that has `node:sqlite` and runs `.ts` files natively (strip-only type removal), so it does not work on older LTS lines. No `engines` field is declared yet.
- **ffmpeg and ffprobe.** The voice-over phase calls `ffprobe` from `PATH`; the assembly adapter calls `/opt/homebrew/bin/ffmpeg` and `/opt/homebrew/bin/ffprobe` (hard-coded; on macOS `brew install ffmpeg` puts them there). Both must exist, including on CI.
- **Git** and **npm**.

## Run it locally

```bash
# backend: http://127.0.0.1:3100 (API docs at /docs)
cd backend
npm ci
npm start

# frontend: http://127.0.0.1:5173
cd frontend
npm ci
npm run dev
```

The frontend talks to `http://127.0.0.1:3100` unless `VITE_API_BASE` is set at build time. The backend listens on loopback only.

### Provider credentials

Real provider calls need four keys, read from the environment first and from a git-ignored `backend/.secrets.json` second (the environment wins):

| Variable | Provider stage |
|---|---|
| `OPENAI_KEY` | decomposition (reasoning) |
| `ELEVENLABS_KEY` | voice and alignment |
| `FAL_API_KEY` | image |
| `RUNNINGHUB_API_KEY` | video |

Never put a key in the repository. A missing key fails the stage with a message naming the variable, never its value.

### Local state

| Variable | Default (relative to the backend working directory) | Holds |
|---|---|---|
| `DB_PATH` | `data/skeleton.sqlite` | the SQLite store (sessions, scenes, attempts) |
| `PROJECTS_ROOT` | `data/projects` | one folder per project: narration, images, clips, final MP4 |

`backend/data/` is git-ignored. Two checkouts that share it share its sessions and migrations, so point `DB_PATH` and `PROJECTS_ROOT` at separate directories when running a second checkout or the tests.

### Development-only switches

These exist for manual endpoint testing and **must never be set in UAT or production**. The backend treats any non-empty value, including `false` and `0`, as enabled, so leave them unset.

| Variable | Effect |
|---|---|
| `ALLOW_TEST_ENDPOINTS` | enables `POST /internal/test/quick-voice-over` and `POST /internal/test/quick-scene` |
| `USE_STUB_VOICE_PROVIDER`, `USE_STUB_VIDEO_PROVIDER`, `USE_STUB_ASSEMBLY_TOOL` | replace a provider with a stub (values are listed in `backend/src/server.ts`) |
| `RETRY_BASE_DELAY_SECONDS`, `RETRY_CAP_DELAY_SECONDS` | shorten retry delays |

## Test

```bash
# backend
cd backend
DB_PATH=/tmp/vid4you-test/s.sqlite PROJECTS_ROOT=/tmp/vid4you-test/projects npm test
npm run typecheck

# frontend
cd frontend
npm test
npm run typecheck
```

Notes from running the suites on a clean checkout:

- Set `DB_PATH` and `PROJECTS_ROOT` as above; the default `data/` paths are shared across all test files.
- `ffprobe` must be on `PATH`, otherwise the voice-over tests fail with "ffprobe is not installed".
- `providerConfig.test.ts` reads `docs/PRD-v1.4.md`, so the `docs/` tree must be present.
- `test/orchestrator.test.ts` is timing-sensitive and fails occasionally in a full run; rerun the file alone before treating it as a regression.
- The `*.contract.test.ts` files call real providers and are skipped when no key is set.

## Branches and environments

There are exactly two hosted environments (decision of the product owner, JOS-194):

| Environment | Branch | Address (planned, not live yet) |
|---|---|---|
| UAT | `feature/entrega-2-JAME` | `uat.vid4you.download` |
| Production | `main` | `vid4you.download` |

```
feature/jos-<n>-<name>  ──PR──▶  feature/entrega-2-JAME (UAT)  ──merge──▶  main (production)
```

- Feature work branches from `feature/entrega-2-JAME` and merges back into it, never straight into `main`.
- Production receives the image that UAT already ran for the same source tree; a production deploy for content UAT never ran fails instead of building. The branch-to-environment mapping is declared in one place so it can change later.
- Hosted environments sit behind an access gate (Cloudflare Access) and are not public. Exposure is pending the product owner's approval of the PRD access change (draft in `openspec/changes/define-production-deployment/prd-draft.md`).
- The hosting decision, its evidence and the delivery pipeline are recorded by `define-production-deployment` (JOS-194); `docs/adr/0007-deployment.md` is written when that change is accepted.

## Specifications

Behaviour is specified in OpenSpec (`openspec/`): each change has a proposal, specs, a design and a task list, and the documentation is the source of truth. Update the change artifacts before changing code that a spec covers.
