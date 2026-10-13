# Follow-up stories — JOS-194

Distribution decision: a local packaged application for macOS and Windows that calls the cloud AI APIs (design Decision 14). Each story names the `deployment-foundation` requirement it satisfies (`specs/deployment-foundation/spec.md`) and the proof-of-concept stand-in it replaces (`poc/local/`, `reports/2026-10-13-step-6e-local-app-poc.md`). Stories are drafts to file in Linear; none is filed yet. Each code story starts with a failing test (TDD).

Requirement abbreviations: **DEC** single documented distribution decision · **PLAT** runs on the supported platforms without installing a runtime · **LOCAL** reachable only by the local user · **ONE** exactly one backend instance per user · **DATA** data kept in the user's data folder · **CRED** credentials stay on the user's computer · **SAFE** release builds are safe by construction · **PROMO** production releases are the artifacts UAT validated · **PIPE** build and release pipeline declared as code · **EVID** recorded evidence · **FUP** follow-up work specified.

## Blockers for any useful build

### S1 — Wire the real assembly tool at server bootstrap — PLAT
`createFfmpegAssemblyTool()` has no caller, so no build produces a final video without a stub flag. Stand-in: `entry.ts` calls `setAssemblyTool(createFfmpegAssemblyTool())`.
- With no `USE_STUB_ASSEMBLY_TOOL`, a session that reaches assembly runs the real tool.
- A start-up test asserts the tool is registered; the existing stub flag still replaces it in development.

### S6 — Forward hand-off after the voice-over (product gap) — FUP
Nothing starts decomposition after `voice-over-complete`, so a session cannot go from script to final video without the test endpoint `quick-scene`. Belongs to `decompose-script-into-chunks` (0/78 tasks); recorded here so it is not forgotten.
- A session created through the public API reaches `final-video` with all stages stubbed, no test endpoint involved.

### L3 — Accept requests only from the app's own page (security) — LOCAL
Any website the user visits can call `127.0.0.1`: today the backend echoes any `Origin` (CORS `origin: true`, and the SSE route writes it back itself) and accepts any `Host`. The PoC showed a foreign origin reading `/languages` with `access-control-allow-origin: https://evil.example`. Stand-in: the guard in `entry.ts`. **Must ship before any release.**
- A request with an `Origin` other than the app's own origin gets `403`; so does one whose `Host` is not the loopback address and port (DNS rebinding).
- The SSE route applies the same rule; CORS no longer allows arbitrary origins (replaces the hosted story S4).
- Requests without `Origin` (navigation, the app's own same-origin fetches that omit it) keep working.

## Packaging

### L1 — A start-up function that works in a bundle and on Windows — PLAT
`server.ts:97` compares `import.meta.url` with `` `file://${process.argv[1]}` ``, which never matches on Windows or in a bundle, and the bootstrap uses top-level `await`. Stand-in: `build.mjs` cuts the bootstrap and `entry.ts` repeats it.
- `server.ts` exports `startServer(options)`; `node src/server.ts` still starts it in development; the packaged entry calls it.
- A test starts the server through `startServer` on an ephemeral port.

### L2 — Per-user data folder and credentials file — DATA, CRED
`DB_PATH`/`PROJECTS_ROOT` default to the working directory and `.secrets.json` is resolved from the source tree (`credentials.ts:18`). Stand-in: `env.ts`.
- Defaults: `~/Library/Application Support/Vid4You` (macOS), `%APPDATA%\Vid4You` (Windows); environment variables still override.
- Credentials: environment first, then `credentials.json` in that folder; a missing key names the file and the variable, never a value.
- Project folder names avoid Windows-reserved names (`CON`, `NUL`, `COM1`…) and trailing dots or spaces.

### S2 — ffmpeg and ffprobe found beside the executable — PLAT
Assembly hard-codes `/opt/homebrew/bin/ffmpeg`; the voice-over check calls `ffprobe` from `PATH`. Stand-in: `env.ts` remaps both.
- `FFMPEG_PATH`/`FFPROBE_PATH` override; otherwise the binaries beside the executable; otherwise `PATH`. Both callers use the same resolution.
- A missing binary fails at start-up with a message naming it.

### L4 — One instance per user — ONE
Stand-in: `entry.ts` probes `/health` on the port first.
- A second launch opens the running instance and exits; a port taken by another program is reported clearly instead of a crash.

### L5 — Release builds are safe by construction — SAFE
Today any non-empty `ALLOW_TEST_ENDPOINTS`/`USE_STUB_*` (even `false`) enables test endpoints or stubs, and an unknown `USE_STUB_VIDEO_PROVIDER` value selects the `transient-failure` stub. Stand-in: `env.ts` deletes them; `build.mjs` replaces `@fastify/swagger-ui`. (Replaces the hosted story S3.)
- A packaged build ignores those variables and serves no `/docs`; development keeps them.

### L6 — Build the executables — PLAT
Stand-in: `poc/local/build.mjs`.
- The backend serves the built frontend on its own port with a same-origin API base (replaces the hosted story S5); the frontend is embedded in the executable.
- One executable per platform from the official Node release binary (checksum-verified), plus ffmpeg/ffprobe beside it, in an archive per platform.
- Targets: macOS arm64 and x64, Windows x64.

### L7 — CI and release channels — PIPE, PROMO
Replaces the hosted CI story S10.
- Pull requests: backend and frontend typecheck and tests with ffmpeg installed, temporary `DB_PATH`/`PROJECTS_ROOT`, no credentials file; the timing-sensitive `orchestrator.test.ts` fixed or quarantined.
- Push to `feature/entrega-2-JAME`: build every platform once per source tree, publish a **pre-release** (UAT) named by tree hash.
- Push to `main`: find the pre-release for `main`'s tree hash and publish **the same files** as a release after a reviewer approves; fail closed if none exists (rule rehearsed in `poc/promotion-check.sh`).
- The branch-to-channel mapping lives in one place.

### L8 — Signing and notarization — PLAT
Without it macOS Gatekeeper and Windows SmartScreen warn on first launch, and some antivirus tools flag unsigned Node executables.
- Needs an Apple Developer account and a Windows code-signing certificate (product-owner purchases); secrets live in the pipeline, never in the repository.

### L9 — Windows verification — PLAT, EVID
Task 6.20: the product owner runs the `.exe` on a Windows laptop.
- Start, page load, one stubbed session to a final video, a kill and relaunch, data under `%APPDATA%\Vid4You`, a title with Windows-invalid characters.

## No longer needed (hosted options, kept for a future hosted or multi-user mode)
S3, S4, S5 are replaced by L5, L3, L6. S7 (VM and host hardening), S8 (compose, Caddy), S9 (Terraform), S10 (hosted CI, replaced by L7), S11 (off-host backups), S12 (gated production deploy), S13 (uptime alerting) and S14 (B+ only: writes without hard links) are not filed. Their evidence stays in the reports.

## Recorded risks not turned into stories
- **Processing stops while the computer sleeps or the app is closed.** Sessions resume on the next launch (shown in the PoC), but a long video needs the laptop awake. Worth a line in the user guide.
- **Backups are the user's.** Data lives only on the user's computer; PRD §12.2 never deletes it, but nothing copies it elsewhere.
- **Size.** About 270 MB on disk (146 MB executable, ffmpeg and ffprobe); acceptable for a desktop tool, reducible later.
- **Real providers inside the executable were not run** in the PoC (stubs only); the first UAT pre-release with keys in the credentials file is the first real test.
- **Port 3100 may be taken** on some machines; L4 must report it, and a configurable port exists (`VID4YOU_PORT` in the PoC).
