## Context

- `npm run package:smoke` (JOS-205) bundles the backend with stub providers into a single executable for `darwin-arm64`, with the real frontend, ffmpeg and ffprobe, into `backend/dist-package/darwin-arm64-smoke/`. It takes about 25 s locally.
- The executable reads `VID4YOU_DATA_DIR` (data folder), `VID4YOU_PORT` and `VID4YOU_NO_BROWSER=1` (no browser window); the smoke flavor keeps the user's `USE_STUB_*` variables and installs its own stubs.
- The SEA blob is tied to Node 26.4.0 (`targets.ts`), so the job pins that version as `release.yml` does. `ci.yml` is reused by `release.yml`, so a macOS job added there would slow every release.

## Goals / Non-Goals

**Goals:** the packaged executable is started and used in CI; a failure shows its log; nothing outside a scratch folder is touched.

**Non-Goals:** other platforms, a browser, signing, real providers.

## Decisions

1. **A separate workflow, `package-smoke.yml`**, with `paths` filters on `backend/**` and `frontend/**`, so documentation-only pull requests do not spend macOS minutes and `release.yml` is unchanged.
2. **`macos-15` only.** `package:smoke` builds `darwin-arm64`; the release workflow already builds the other targets.
3. **A Node script, `smokeRun.ts`**, run by `node` (strip-only, like the rest of `backend/`) instead of a shell script, so the same file works on a developer's Mac and in CI. It uses `fetch` and polls with a bound; no dependency.
4. **Port 3102 and a scratch `VID4YOU_DATA_DIR`** from `mkdtempSync`, removed in `finally`; the executable is sent `SIGTERM`, then `SIGKILL`. 3102 is not the product's 3100, so a running copy is never reused (the executable would otherwise open the running one and exit).
5. **The script asserts what a user relies on:** `/health`, the embedded page (`id="root"`), a session reaching `final-video` and a non-empty video. The session script is "A calm sea tonight." (19 characters, the limit the stub voice's timestamps allow).
6. **The log is printed, not uploaded.** On failure the script prints the executable's output after the error, so it is in the job log without an artifact.

## Risks / Trade-offs

- [macOS runner minutes] → `paths` filter and one job.
- [Port 3102 busy] → the executable would not start or `/health` would answer from another program; the script fails with the executable's log naming it.
- [Hosted-runner flakiness on the ffmpeg download] → `build.ts` verifies every download against a committed SHA-256 and fails loudly; a rerun is the remedy.
