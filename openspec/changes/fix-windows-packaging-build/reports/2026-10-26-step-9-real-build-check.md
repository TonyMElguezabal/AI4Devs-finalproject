# Step 9 Report - Real build check

- Date: 2026-10-26
- Change: fix-windows-packaging-build (JOS-232)
- Agent: Claude Sonnet 5.5

## What ran
`npm run package:smoke` in `backend` on macOS arm64 (the smoke flavor builds `darwin-arm64`). It downloads and verifies the pinned Node, ffmpeg and ffprobe, runs the frontend build through `npm_execpath` (this change's code path), builds the backend bundle and the single-executable blob, injects it and signs it.

## Result
The build completed in 22 s: the frontend step printed "✓ built in 387ms", the blob was written, the injection finished and `dist-package/darwin-arm64-smoke/` holds `Vid4You`, `ffmpeg` and `ffprobe` (the folder is not tracked). So the macOS path is unchanged and the new invocation works through npm.

## Not checked here
The Windows case: `npmInvocation` is pinned for `win32` by the unit tests, but only a Windows runner shows that the build gets past this step and whether other Windows-only problems follow. That is task 10.4, after the merge.

## Outcome
- Step 9 status: PASS (macOS); Windows pending CI
