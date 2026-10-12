# ADR 0007 — Deployment: UAT and production (JOS-194)

- Status: Accepted (product-owner decision, 2026-10-12); the VM provider is still open
- Date: 2026-10-12
- Change: `define-production-deployment` (JOS-194)

## Context

Vid4You ran only on a developer's machine. The product owner wants exactly two hosted environments: **UAT** deployed from `feature/entrega-2-JAME` and **production** deployed from `main` (the mapping may change, so it is declared once), on the domain `vid4you.download`, delivered through CI/CD and declared as code. The backend is one long-lived Node process that owns the orchestrator, retry timers, an in-memory concurrency cap, SQLite (`node:sqlite`, WAL), the media tree, ffmpeg subprocesses and one SSE stream per open page (ADR 0001–0003, PRD §12.1–§12.2). PRD §2.3, §12.3 and D07 described the MVP as a local, account-free install; the product owner approved the PRD change that allows a hosted single-user install behind an edge access gate.

Full evidence: `openspec/changes/define-production-deployment/` (`design.md` § Execution Record, `reports/`, `poc/`).

## Decision

**Option A: Cloudflare is the edge; the backend runs as one container on one VM per environment.**

- **Edge:** Cloudflare DNS and TLS, a Cloudflare Tunnel (the VM dials out; no inbound port is open) and a Cloudflare Access application whose policy admits an explicit email list (initially the product owner's address only). The gate covers the page and the API.
- **Host:** one VM per environment, a compose project in a shared network namespace: the backend (listens on `127.0.0.1:3100`), Caddy (serves the built frontend and forwards `/api/*` with the prefix stripped; SSE unbuffered) and `cloudflared`. `DB_PATH` and `PROJECTS_ROOT` live on one persistent volume.
- **Frontend placement (F4):** same origin, `VITE_API_BASE=/api`; the same build serves both environments.
- **Delivery:** GitHub Actions. The image is built once per source tree, tagged with `git rev-parse HEAD^{tree}`, and promoted to production **by digest**; the production job fails closed when UAT never ran that tree, and waits for a reviewer. Deploys are stop-then-start (one process at a time).
- **Infrastructure as code:** OpenTofu/Terraform for the edge, the VM, its firewall (deny all inbound) and the backup bucket; the zone is imported.
- **Storage and backup:** SQLite online backup (`sqlite3 .backup`, never a copy of the live WAL) plus `restic` of `PROJECTS_ROOT` to an R2 bucket; recovery point = the backup interval (proposed 15 min for the database, 1 h for files).
- **Observability:** `GET /health` behind an Access service token for an external uptime check, Docker `local` log driver with rotation, email alerts for a failed check and a stale backup.

### Gates and options

| Option | Result |
|---|---|
| **A — Tunnel + VM** | passes G1–G6; fails G7 (compute outside Cloudflare), **waived by the product owner**; score 7.40 |
| B — Containers as is | eliminated at G2: ephemeral disk, manual beta snapshots, no instance pinning |
| **B+ — Containers + Litestream/R2 + FUSE** | passes all gates conditionally on three PoC unknowns; score 6.70; **runner-up**, not built |
| C — Workers rewrite | eliminated at G4: no subprocess, no `node:sqlite`; largest code change |
| D — Kubernetes | dominated by A: the same G7 failure with more to operate |

Gates: G1 one backend process and resumable restarts; G2 durable storage; G3 long-lived SSE through the edge; G4 Linux with ffmpeg and Node ≥ 22.5; G5 access gate on page and API; G6 per-environment secrets outside the image; G7 compute in the Cloudflare account. Weights: durability 30%, code change 25%, deploy/rollback/same artifact 25%, operational load 20% (cost not scored by decision).

## Evidence (proof of concept, 2026-10-12)

Real Cloudflare edge, `poc.vid4you.download`, host stood in by a developer machine (Linux containers under Colima), providers stubbed, assembly through real ffmpeg on Linux:

- Unauthenticated page and API: `302` to the Access login; service token: `200`; no port published on the host.
- One stubbed session reached `final-video` and downloaded as 58,205 B `video/mp4` through the edge.
- SSE through the edge: heartbeats every 15 s held beyond Cloudflare's 125 s read timeout (see the report for the 16-minute run).
- Backend restart between stages: session intact, completed, edge healthy 7 s later.
- Not proven: a restart while a stage is running, real providers on a hosted machine, the backup/restore drill, and the allowed-identity browser login. These are listed in the change's tasks and the follow-up stories.

## Cost (for information)

A small VM per environment is single-digit euros per month; Tunnel, Access (≤ 50 users) and DNS are free; R2 is cents at this volume; domain renewal at the registrar's price. B+ would be about $40–45 per environment per month. UAT calls real providers with no spending cap (product-owner decision), so each UAT run has a provider cost.

## Consequences

- No hosted environment can produce a final video until the real assembly tool is wired at server bootstrap (`createFfmpegAssemblyTool()` has no caller), and a session cannot go from script to final video without test endpoints until the decomposition hand-off lands. Both are follow-up stories, not configuration.
- Follow-up stories: wire the assembly tool; configurable `FFMPEG_PATH`/`FFPROBE_PATH`; `HOST` setting (not needed with the shared namespace, still worth having); frontend API base `/api`; CORS and SSE `Origin` restricted to the environment's origin; start guards that reject any present `ALLOW_TEST_ENDPOINTS`/`USE_STUB_*` (today any non-empty value, including `false`, enables them); VM provider and host hardening; compose project and Caddy; OpenTofu for UAT; CI and UAT deploy; backup and restore drill; production with gated promotion; health and alerting.
- Risks: a single VM per environment is a single point of failure (bounded by backups and a Terraform replace); the OS is patched by us; the VM must never be reachable around the gate; UAT spend is attributable only if each provider allows a separate key (checked per provider in the follow-up).
- Revisit B+ if the VM's operating load proves too high; it passed every gate on documentation but was never run.

## Open

- VM provider (leading candidate Hetzner Cloud); needs an account the product owner creates.
