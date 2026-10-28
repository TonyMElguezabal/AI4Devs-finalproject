# ADR 0007 — Distribution: a local packaged application (JOS-194)

- Status: Accepted (product-owner decision, 2026-10-13)
- Date: 2026-10-13 (evaluation started 2026-10-12)
- Change: `define-production-deployment` (JOS-194)
- Amended: 2026-10-20 (JOS-203), product-owner decision: `main` is the single official environment; the UAT/production split below is superseded. See the amended bullet under *Decision*.
- Amended: 2026-10-26 (JOS-206): the release workflow exists. See the *Release workflow* bullet under *Decision*.

## Context

The MVP stories were done but Vid4You only ran from a developer's checkout. The product owner asked how to ship it, with exactly two environments, UAT fed by `feature/entrega-2-JAME` and production by `main` (mapping declared once), production running exactly what UAT validated, delivered through CI/CD.

The backend is one long-lived Node process that owns the orchestrator, retry timers, an in-memory concurrency cap, SQLite (`node:sqlite`, WAL), the media tree, ffmpeg subprocesses and one SSE stream per open page (ADR 0001–0003, PRD §12.1–§12.2). The AI work (reasoning, voice, alignment, image, video) is done by cloud providers through their APIs.

Full evidence: `openspec/changes/define-production-deployment/` (`design.md` § Decisions 1–14 and § Execution Record, `reports/`, `poc/`).

## Decision

**Vid4You ships as one executable per platform that runs on the user's own computer and calls the cloud AI APIs.** It must run on macOS and on Windows laptops.

- **Executable:** the backend is bundled into a Node single executable application (built from the official Node release binary). It serves the built frontend on `127.0.0.1` and opens the default browser. Static ffmpeg and ffprobe ship beside it. The user installs nothing else. Targets: macOS arm64 and x64, Windows x64.
- **Data:** the SQLite store, project folders and the credentials file live in the per-user data folder (`~/Library/Application Support/Vid4You`, `%APPDATA%\Vid4You`), never in the install folder, so upgrades keep every session and video.
- **Credentials:** read from the environment, then from `.secrets.json` in the data folder. They are never in the executable, the repository or logs.
- **Reachable only by the local user:** the backend listens on loopback only and rejects any request whose `Origin` is not the app's own or whose `Host` is not the loopback address and port, SSE included. This matters because any website the user visits can send requests to `127.0.0.1`.
- **One instance per user:** a second launch opens the running instance.
- **Release builds are safe:** test endpoints, stub providers and `/docs` are unavailable whatever the user's environment says.
- **`main` is the official environment** (amended 2026-10-20). The MVP integration branch `feature/entrega-2-JAME` was promoted to `main` by pull request #71 and every release comes from `main`. The original decision of 2026-10-13 had two release channels: UAT fed by `feature/entrega-2-JAME` (a pre-release built once per source tree on every push) and production fed by `main` (the same files published as a release after a reviewer approves and only if a pre-release exists for `main`'s tree hash, failing closed; the key is the tree hash because GitHub merges create new commit SHAs). That two-channel flow is **superseded** (the sketch is `openspec/changes/archive/2026-10-19-define-production-deployment/poc/workflows/release.yml`).
- **Release workflow** (JOS-206, 2026-10-26): `.github/workflows/release.yml` is the single channel. A push to `main` runs the checks, builds macOS arm64, macOS x64 and Windows x64 on native runners once per source tree, and publishes one GitHub release tagged `release-<tree hash>` with `SHA256SUMS.txt` after a reviewer approves the protected `release` environment; a tree that already has a release is not rebuilt. A `verify` job downloads the assets and checks them. The build embeds channel `production`, a `YYYY.MM.DD-<tree prefix>` version and the tag, so the update check compares tags. `workflow_dispatch` offers `dry-run` (artifacts only) and `test-release` (a `test-<hash>` pre-release); pushes to other branches or with `[skip release]` build nothing. The published ffmpeg is the non-redistributable build pinned by JOS-205; the product owner accepted that (the software is not meant for distribution). Rollback: delete the release or turn it into a pre-release (README 1.4). Signing is JOS-207.

## Options evaluated

| Option | Outcome |
|---|---|
| **E — Local packaged application (cloud AI APIs)** | **chosen.** Uses the user's CPU, memory and disk; no hosting, no access gate, no infrastructure to run; matches the MVP's original local, single-user model |
| A — Cloudflare Tunnel + Access in front of one VM per environment (Hetzner Cloud) | proven in a PoC (gate, SSE 970 s through the edge, restarts incl. mid-stage); set aside. Finding: sharing the backend's network namespace with the connector breaks after a crash restart |
| B+ — Cloudflare Containers, SQLite replicated to R2 by Litestream, media on an R2 FUSE mount | proven in a PoC (0 of 8 sessions lost across kills, keep-alive via `onActivityExpired`, SSE through the Worker); set aside. Findings: no hard links on the mount (`db.ts` uses `linkSync`), the library's `schedule()` keep-alive unreliable, one unexplained failed rollout in four, about $26–45 per environment per month |
| B — Cloudflare Containers as is | eliminated: ephemeral disk |
| C — Workers-native rewrite | eliminated: no subprocess or `node:sqlite` in Workers; largest code change |
| D — Kubernetes | dominated by A |
| Fully local AI (local models instead of the APIs) | set aside: image-to-video on a 32 GB M1 Max is estimated at minutes per clip at 480–720p, far from the 1080p target |

A and B+ remain the documented starting points if a hosted or multi-user mode is ever wanted.

## Evidence (proof of concept on macOS, 2026-10-13)

Executable built by `poc/local/build.mjs`. It was run with `PATH=/usr/bin:/bin` (nothing from Homebrew) and stubbed providers, with real ffmpeg:

- A session started from the UI reached `final-video`: an h264 1920×1080 + mp3 MP4, downloaded.
- Live updates rendered without a reload.
- After `kill -9` mid video stage and a relaunch, the backend resumed the pending request. The open page reconnected and finished on its own.
- Today's code lets a foreign origin read the API (`access-control-allow-origin: https://evil.example`) and accepts a rebinding `Host`. The PoC guard answered `403` to both, plus cross-origin POST and SSE.
- A second launch opened the running instance.
- Not yet proven: Windows (the product owner tests the `.exe` on a laptop), real providers inside the executable, signing.

## Cost

There's no hosting cost. Provider API usage is as today (UAT calls real providers with no cap). Signing later needs an Apple Developer membership and a Windows code-signing certificate.

## Consequences

- **Blockers for a useful build:**
  - wire the real assembly tool at bootstrap (S1) and start decomposition after the voice-over (S6): **done in JOS-195** (`run-session-end-to-end`);
  - restrict `Origin`/`Host` (L3, security, before any release).
- **Packaging stories:**
  - a `startServer()` that works in a bundle and on Windows (L1);
  - the data folder and credentials file (L2);
  - ffmpeg resolution (S2);
  - single instance (L4);
  - release-build safety (L5);
  - the build per platform (L6): **done in JOS-205** — `cd backend && npm run package:darwin-arm64 | package:darwin-x64 | package:win32-x64` writes `Vid4You`, `ffmpeg` and `ffprobe` to `backend/dist-package/<target>/` (see "Build" below);
  - CI and release channels (L7);
  - signing (L8);
  - Windows verification (L9).
  - Details: `openspec/changes/define-production-deployment/follow-up-stories.md`.
- **Accepted trade-offs:**
  - Processing pauses while the computer sleeps or the app is closed, and resumes on the next launch.
  - Data lives only on the user's computer.
  - About 270 MB on disk.
- PRD v1.6 admitted a hosted deployment behind an access gate. A v1.7 draft that describes the local packaged application goes to the product owner (task 2.4).

## Build (JOS-205)

- **Command.** `backend/packaging/build.ts`, run by `npm run package:<target>` in `backend/`. It needs Node exactly as pinned in `targets.ts` (the SEA blob is tied to the Node version), `npm ci` in `backend/` and `frontend/`, and network access. The macOS targets need a Mac (the binary is ad-hoc signed with `codesign`); Windows x64 builds on any host. `--smoke` (`npm run package:smoke`) builds a separate flavor with stub providers for manual testing; the release commands never include it.
- **SEA and postject.** The blob is made with `node --experimental-sea-config` and injected with `postject` into the official Node binary of the target, so one code path builds all three targets from one host (`node --build-sea` can only target the host's platform). The bundle is one CommonJS file made by esbuild; the backend source is not patched or cut. The only differences from `npm start` are environment variables the packaged entry sets (`DB_PATH`, `PROJECTS_ROOT`, `SECRETS_PATH`, `SETTINGS_PATH`, `PROVIDER_KEY_PATH`, `SETTINGS_DEFAULTS_PATH`, `FFMPEG_PATH`, `FFPROBE_PATH`) and `@fastify/swagger-ui` replaced by an empty plugin, so `/docs` answers 404.
- **Pinned downloads.** `targets.ts` commits the URL and SHA-256 of the Node archive and of the ffmpeg and ffprobe binary of each target; a mismatch fails the build before anything is written to the output folder.
- **ffmpeg license (open before the first public release).** The pinned ffmpeg and ffprobe 6.0 builds (`eugeneware/ffmpeg-static`, release b6.0) are configured with `--enable-gpl --enable-version3 --enable-nonfree`. The assembly step needs libx264, so any build the product can use is GPL; `nonfree` additionally forbids redistribution. They are acceptable for local and private builds only. Before JOS-206 publishes anything, replace them with a redistributable build (and decide how the GPL source offer is met) and update the hashes.
- **libass and the subtitle font (JOS-237).** The final video carries burned-in subtitles, drawn by ffmpeg's `subtitles` filter, which needs libass. The three pinned b6.0 builds were checked on 2026-10-28 (SHA-256 matched; the darwin-arm64 build was run, the other two were inspected): all list `--enable-libass` and `--enable-libfreetype`, so no replacement was needed. They are built without fontconfig, so libass reads only the bundled font. `Montserrat-Bold.ttf` (SIL Open Font License) and its `OFL.txt` are embedded in the executable as single-executable assets and written to `<data folder>/runtime/` at every start, like the settings defaults; `SUBTITLE_FONT_PATH` points there. A packaged smoke run on darwin-arm64 produced a final video with the subtitles drawn by the bundled ffmpeg; the first release run proves the other two targets.

## Signing (JOS-207)

- **Decision (2026-10-26, product owner).** Releases stay unsigned for now; no Windows certificate and no Apple Developer account are bought yet, to avoid the subscription cost. The provider, cost and holder are decided when they are bought (expected within months).
- **Ready and dormant.** The release workflow already contains the macOS signing and notarization steps, the Windows verification step and the unsigned labeling (`-unsigned` archive names and a release-notes line). They run only when the `signing` environment (from `main`) holds the secrets; `SIGNING_REQUIRED=true` then makes a missing secret fail the build. The Windows signing script is written when the provider is chosen.
