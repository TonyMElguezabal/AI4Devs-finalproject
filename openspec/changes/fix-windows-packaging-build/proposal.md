# Fix the packaging build on Windows

Linear-Issue: JOS-232 (unblocks JOS-206; follows JOS-231)

## Why

With JOS-231 merged, the Release workflow's checks pass, but `build (win32-x64, windows-2025)` fails at `npm run package:win32-x64` with `spawnSync npm ENOENT` (dry-run 40448008285 and the push run 40447975464 on `main`; the macOS builds were cancelled by the matrix, not failed). `backend/packaging/build.ts` starts the frontend build with `execFileSync("npm", ...)`; on Windows `npm` is `npm.cmd`, which Node does not start without a shell. It was the first time the packaging ran on a Windows runner. No release can be produced, and JOS-206 tasks 7.2 to 7.5 stay blocked.

## What Changes

- The packaging script starts npm without depending on the platform's launcher: it runs npm's own script (`npm_execpath`, which npm sets for any `npm run` script such as `package:<target>`) with the current Node. Without that variable it falls back to `npm`, with a shell only on Windows.
- A test pins the command built for each case (Windows and macOS or Linux, with and without `npm_execpath`).
- Any further Windows or macOS build problem the next CI run shows is recorded in this change and fixed here if it is small, or ticketed if not.

Non-goals: signing, publishing, notarization, changing the build's steps or outputs, and the two lint warnings.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. No requirement changes; the build's outputs are the same.

## Impact

- Backend: `backend/packaging/build.ts` and `backend/test/packaging-build.test.ts`.
- CI: the Release `dry-run` should get past the Windows build.
- No API, data, frontend, PRD or README change.
