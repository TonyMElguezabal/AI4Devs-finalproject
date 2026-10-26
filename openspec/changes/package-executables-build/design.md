## Context

`deployment-foundation` and ADR 0007 already fix what the packaged application is: a Node single executable application (SEA) per platform that serves the built frontend and the API on `127.0.0.1:3100`, with ffmpeg and ffprobe beside it and data in a per-user folder. JOS-194 proved it with a throwaway script (`openspec/changes/archive/2026-10-19-define-production-deployment/poc/local/{build.mjs,entry.ts,env.ts}`). That script cannot be reused as is:

- It computes the repository root from its own depth, so it fails once archived.
- `entry.ts` imports the backend with `../../../../../backend/src/...` paths and re-implements the boot sequence of `server.ts`.
- `env.ts` patches `child_process.execFile` to map ffmpeg names, but `backend/src/config/ffmpeg.ts` already honors `FFMPEG_PATH` and `FFPROBE_PATH` (PR #65), so the patch is obsolete.
- The esbuild plugin cuts everything after a marker comment from `server.ts`, defines `import.meta.dirname` as a global to redirect the secrets file, and defines `import.meta.url` as a constant.
- The Windows executable was cross-built on macOS with `postject`.

Three backend modules read locations that differ in a bundle: `config/credentials.ts` (`import.meta.dirname/../../.secrets.json`), `config/providers.ts` (`import.meta.dirname/../../config/settings.default.json`, written after the PoC, so the PoC's `import.meta.dirname` trick would send it to the wrong folder), and `keyStore.ts` (`data/provider-keys.key`, relative to the working directory, which for a double-clicked executable is not the data folder). `SETTINGS_PATH` also defaults to a working-directory-relative path.

## Goals / Non-Goals

**Goals:**

- One documented command per target, from the product tree, with no manual copying and no archived code in the build path.
- The backend source runs in the bundle without substitutions; the only differences are environment variables the packaged entry sets.
- Verified downloads, offline-testable build logic.

**Non-Goals:**

- Signing and notarization (JOS-207), release workflow and channels (JOS-206), database downgrade check (JOS-210), full-size session timing (JOS-209).
- Linux x64 (cheap to add; not a product commitment per ADR 0007).
- Changing the interface, API or database.

## Decisions

### Decision 1: Location of the build

The build lives in `backend/packaging/` as strip-only TypeScript run by `node` (no new toolchain): `build.ts` (orchestration), `targets.ts` (the three targets and their pinned downloads), `verify.ts` (checksum), `entry.ts` (packaged entry), `runtimeEnv.ts` (data folder and environment). npm scripts in `backend/package.json`: `package:darwin-arm64`, `package:darwin-x64`, `package:win32-x64`. Output goes to `backend/dist-package/<target>/` (git-ignored).

*Alternatives:* a root-level `packaging/` package with its own `package.json` (a third `npm ci` for a script that needs the backend's dependencies anyway); keep `build.mjs` JavaScript (loses typing, which `CLAUDE.md` requires).

### Decision 2: Dev dependencies `esbuild` and `postject`

Both are added to `backend` as exact-version dev dependencies. The PoC borrowed esbuild from `frontend/node_modules`, which couples the backend build to the frontend install order; `postject` was an ad-hoc `npx`. The frontend build is invoked as `npm run build` in `frontend/` with `VITE_API_BASE=""` (same-origin) and its `dist/` is embedded as SEA assets.

*Alternative:* `node --build-sea` on the host only, as the PoC did for same-platform builds. It cannot target Windows from a Mac and needs the host's Node to have the SEA fuse. Using `node --experimental-sea-config` to make the blob and `postject` to inject it into the target's official `node` binary works for all three targets from one code path.

### Decision 3: Pinned, checksummed downloads

`backend/packaging/targets.ts` commits, per target, the Node version, the archive URL and its SHA-256, and the URL and SHA-256 of the ffmpeg and ffprobe binaries. `verify.ts` hashes each downloaded file and throws on a mismatch before anything is written to the output folder. Node's hash is cross-checked against `SHASUMS256.txt` when the manifest is updated, not at every build. The Node version is the one in `backend/package.json` `engines`/`.nvmrc` equivalent, recorded once in `targets.ts`.

*Alternatives:* trust `ffmpeg-static` and `ffprobe-static` from npm as the PoC did (their postinstall downloads are not pinned by this repository's lockfile hash for the binary itself); verify only against the published `SHASUMS256.txt` fetched at build time (a compromised mirror could serve both).

### Decision 4: Split the bootstrap instead of cutting it

`server.ts` keeps `buildApp()` and its exports, and its tail (everything after "Bootstrap only when this file is run directly") moves into an exported `startServer(options)` in `backend/src/bootstrap.ts`. `server.ts` calls it when run directly (unchanged behavior for `npm start`); the packaged entry calls it too and adds only what is packaged-specific: the single-instance probe, the embedded static files in front of Fastify, the Origin and Host guard if `originPolicy.ts` does not already cover it, and opening the browser. This removes the marker-based cut, the `import.meta.url` constant and the duplicated boot sequence, so a future change to the boot sequence cannot silently diverge in the executable.

*Alternative:* keep the esbuild plugin that slices the file (fragile: it breaks on a comment edit and the packaged boot can drift from the real one).

### Decision 5: Locations by environment variable, defaults unchanged

`credentials.ts` reads `SECRETS_PATH ?? resolve(import.meta.dirname, "../../.secrets.json")`; `providers.ts` reads `SETTINGS_DEFAULTS_PATH ?? join(import.meta.dirname, "../../config/settings.default.json")`; `keyStore.ts` already has `PROVIDER_KEY_PATH`. The packaged entry (`runtimeEnv.ts`, imported first) sets `DB_PATH`, `PROJECTS_ROOT`, `SECRETS_PATH`, `SETTINGS_PATH`, `PROVIDER_KEY_PATH`, `FFMPEG_PATH`, `FFPROBE_PATH` under the data folder or beside the executable, and `SETTINGS_DEFAULTS_PATH` to a copy of `settings.default.json` it writes from an embedded asset into `<dataDir>/runtime/` on every start, so the defaults always match the binary. Development behavior is unchanged because every default stays.

*Alternative:* bundle the JSON defaults with an esbuild `json` loader; it needs `providers.ts` to import the file instead of reading a path, which changes how tests substitute it.

### Decision 6: Release safety in the entry, `/docs` out of the bundle

`runtimeEnv.ts` deletes `ALLOW_TEST_ENDPOINTS` and every `USE_STUB_*` variable before any backend module loads (the PoC's rule, minus its stub-mode exception). The esbuild build aliases `@fastify/swagger-ui` to an empty plugin, because it serves files from `node_modules` at runtime and so cannot work inside a SEA; `/docs` therefore answers 404. The alias is a build option, not a code cut.

### Decision 7: Macroscopic stub run lives in a separate smoke flavor

The Definition of Done asks for one stubbed session to `final-video` through the executable. A release executable ignores stubs by design (Decision 6), so `build.ts --smoke` produces a separate flavor that keeps the `USE_STUB_*` switches and is written to a different output folder with a different file name suffix. The release commands never pass `--smoke`, and a test asserts the default bundle does not contain the smoke entry.

### Decision 8: Host requirements per target

Windows x64 builds on any host (inject into `node.exe`). macOS targets need a macOS host because the injected binary must be ad-hoc signed with `codesign`; on other hosts the build stops before downloading anything. macOS x64 builds on Apple Silicon because the signature is per file, not per machine.

## Risks / Trade-offs

- [The pinned ffmpeg builds may be GPL-licensed, which affects redistribution] → Record the license of the chosen build in `targets.ts` and the ADR before the first public release; choose an LGPL build if one satisfies the output format.
- [Node SEA is an experimental feature and its flags change between releases] → Pin the Node version and the `postject` version; the bundle test fails on a flag change; Node upgrades are a manifest update.
- [Windows cross-build from macOS is not the same as building on Windows] → The Definition of Done requires the Windows executable to be started once on a real Windows machine, including the second launch.
- [`SETTINGS_DEFAULTS_PATH` and `SECRETS_PATH` become public configuration] → Documented in the README environment table; defaults unchanged.
- [The browser-opening and single-instance code is only exercisable in the executable] → Both are small, parameterized (`VID4YOU_NO_BROWSER`, `VID4YOU_PORT`) and exercised by the recorded manual runs; the probe function is unit-tested against a local server.

## Open Questions

- Which ffmpeg and ffprobe builds to pin (source, license, version). The PoC used the `ffmpeg-static` 5.2.0 and `ffprobe-static` 3.1.0 binaries; confirm them or choose others before task 2.2.
- Whether `originPolicy.ts` already enforces the Host check the PoC added (DNS rebinding) or only the Origin check; if only Origin, the packaged entry keeps the Host guard.
