## Why

`npm run package:smoke` builds the packaged application with stub providers, but nothing runs it in CI. A change that breaks the packaged entry, the embedded frontend or the bundled ffmpeg is found only when a release is built, which is too late and costs a release run. JOS-279 asks for the smoke run to be repeatable on every pull request that could affect it.

## What Changes

- Add `backend/packaging/smokeRun.ts`: starts the smoke executable on a scratch data folder and a fixed port, checks `/health` and that the embedded page loads, runs one session to `final-video`, downloads the video, and stops the executable. On failure it prints the executable's log and exits 1.
- Add the `package:smoke:run` script in `backend/package.json`.
- Add `.github/workflows/package-smoke.yml`: a `package-smoke` job on `macos-15` that builds the smoke flavor and runs the script, on pull requests that change `backend/`, `frontend/` or the workflow itself (and on demand).
- Document it in `readme.md` §2.6 and `docs/development_guide.md`.

Non-goals: Windows or Intel macOS runs (the release builds them), signed builds, real providers, driving the page in a browser, and a run on every pull request regardless of paths.

## Capabilities

### New Capabilities
- `package-smoke-verification`: a repeatable run of the packaged executable (smoke flavor) in CI.

### Modified Capabilities

None. No product behavior changes; the smoke flavor already exists.

## Impact

- New: `backend/packaging/smokeRun.ts`, `.github/workflows/package-smoke.yml`.
- Changed: `backend/package.json` (one script), `readme.md`, `docs/development_guide.md`.
- CI cost: one macOS job of about three minutes, only when the paths match. It is a separate workflow, so `release.yml`, which reuses `ci.yml`, is unchanged.
