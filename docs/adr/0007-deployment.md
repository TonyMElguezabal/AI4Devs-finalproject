# ADR 0007 — Distribution: a local packaged application (JOS-194)

- Status: Accepted (product-owner decision, 2026-10-13)
- Date: 2026-10-13 (evaluation started 2026-10-12)
- Change: `define-production-deployment` (JOS-194)

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
- **UAT and production are release channels:** a push to `feature/entrega-2-JAME` builds every platform once per source tree as a pre-release. A push to `main` publishes **the same files** as a release, after a reviewer approves and only if a pre-release exists for `main`'s tree hash (fail closed). GitHub merges create new commit SHAs, which is why the key is the tree hash.

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
  - the build per platform (L6);
  - CI and release channels (L7);
  - signing (L8);
  - Windows verification (L9).
  - Details: `openspec/changes/define-production-deployment/follow-up-stories.md`.
- **Accepted trade-offs:**
  - Processing pauses while the computer sleeps or the app is closed, and resumes on the next launch.
  - Data lives only on the user's computer.
  - About 270 MB on disk.
- PRD v1.6 admitted a hosted deployment behind an access gate. A v1.7 draft that describes the local packaged application goes to the product owner (task 2.4).
