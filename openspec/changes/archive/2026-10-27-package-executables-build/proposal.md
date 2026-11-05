## Why

The macOS and Windows executables exist only as output of the archived JOS-194 proof of concept. Its `build.mjs` works only at its original folder depth, its entry file imports the backend by relative path, and it patches `child_process` and `import.meta` to make the backend run inside a bundle. Nothing in the product tree builds an executable (JOS-205, item M9 of the MVP closure), so no distributable release can be produced or reproduced.

## What Changes

- Add a typed build in the product tree (`backend/packaging/`) that produces `Vid4You` (`Vid4You.exe` on Windows), `ffmpeg` and `ffprobe` for macOS arm64, macOS x64 and Windows x64 into one output folder, with one documented npm command per target.
- Add a packaged entry point in the product tree that starts the same backend, serves the embedded frontend, opens the browser and handles a second launch.
- Remove the need for proof-of-concept substitutions in the bundle: split server bootstrap out of `server.ts`, and read the secrets file, settings defaults and master-key file locations from environment variables the packaged entry sets.
- Verify the checksum of the downloaded Node binary and of the ffmpeg and ffprobe binaries against committed values, failing the build on a mismatch.
- Strip `ALLOW_TEST_ENDPOINTS` and `USE_STUB_*` and leave `/docs` out of the packaged build.
- Cover the bundle step and the checksum check with automated tests that need no network.
- Update `readme.md` section 1.4 and `docs/adr/0007-deployment.md` with the real build command.

Non-goals: signing and notarization (JOS-207), the release workflow and channels (JOS-206), upgrade and downgrade checks of the local database (JOS-210), a full-size session timing (JOS-209).

## Capabilities

### New Capabilities

- `executable-packaging`: a repeatable, checksum-verified build of the packaged application for each supported platform from the product tree, and the behavior of the packaged entry point it produces.

### Modified Capabilities

None. The behavior the executable must have (single instance, data folder, credentials, release safety) is already required by `deployment-foundation`; this change makes it reproducible and adds no requirement to it.

## Impact

- New: `backend/packaging/` (build script, packaged entry, checksum manifest, tests), npm scripts in `backend/package.json`, dev dependencies `esbuild` and `postject` in `backend`.
- Changed: `backend/src/server.ts` (bootstrap moved into an exported function), `backend/src/config/credentials.ts`, `backend/src/config/providers.ts` and `backend/src/keyStore.ts` (location overrides by environment variable, defaults unchanged).
- Docs: `readme.md` section 1.4 and 2.4, `docs/adr/0007-deployment.md`.
- No API, database or frontend change. Development with `npm start` is unchanged.
