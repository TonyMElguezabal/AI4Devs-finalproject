# Follow-up stories — JOS-194

Each story names the `deployment-foundation` requirement it satisfies (spec: `specs/deployment-foundation/spec.md`). Order follows `design.md` § Migration Plan. Stories are drafts to file in Linear; none is filed yet. The PRD access change is approved (task 2.2), so none is blocked on it.

Requirement abbreviations: **DEC** single documented hosting decision · **GATE** no exposure without an approved access gate · **ONE** exactly one backend instance · **STORE** durable and recoverable storage · **PROMO** production ships the artifact UAT validated · **CONF** safe configuration · **IAC** infrastructure as code · **EVID** recorded evidence · **FUP** follow-up work specified.

## Code stories (no environment needed; each with its own failing test first)

### S1 — Wire the real assembly tool at server bootstrap — CONF, ONE (blocker)
`createFfmpegAssemblyTool()` has no caller, so no hosted environment can produce a final video.
- With no `USE_STUB_ASSEMBLY_TOOL`, a session that reaches assembly runs the real tool and does not fail with "no assembly tool is configured".
- A start-up test asserts the tool is registered; the existing stub flag still replaces it.

### S2 — Configurable ffmpeg and ffprobe paths — CONF
- `FFMPEG_PATH` and `FFPROBE_PATH` select the binaries; the default is the binary on `PATH`, no longer `/opt/homebrew/bin`.
- A missing binary fails at start-up with a message naming the variable.

### S3 — Start guards for test-only switches — CONF
- The backend refuses to start when `ALLOW_TEST_ENDPOINTS` or any `USE_STUB_*` variable is **present**, whatever its value, when `NODE_ENV=production`.
- An unrecognised `USE_STUB_VIDEO_PROVIDER` value fails instead of selecting the `transient-failure` stub.

### S4 — CORS and SSE origin restricted to the environment's origin — CONF
- `@fastify/cors` accepts only the configured origin (environment variable); the SSE route applies the same check instead of echoing `Origin`.
- A request from a foreign origin gets no `Access-Control-Allow-Origin`.

### S5 — Frontend API base `/api` — PROMO, CONF
- The hosted build uses `VITE_API_BASE=/api`; the same build artifact runs in both environments.
- Local development keeps working with the existing default.

### S6 — Forward hand-off after the voice-over (product gap) — FUP
Nothing starts decomposition after `voice-over-complete`; UAT cannot go script → final video without test endpoints. Belongs to `decompose-script-into-chunks` (0/78 tasks); recorded here so it is not forgotten. Acceptance: a session created through the public API reaches `final-video` with all stages stubbed, no test endpoint involved.

## Environment stories

### S7 — VM provider and host hardening — GATE, ONE
- Provider: Hetzner Cloud (decided 2026-10-12). The product owner creates the account and a project API token; the agent never creates paid resources without a go-ahead.
- One VM per environment; firewall denies all inbound traffic; no published port; automatic security updates; a probe of the VM's address on every port is refused.

### S8 — Compose project, Caddy and the production image — ONE, CONF, IAC
- Productionise `poc/Dockerfile.a`, `Dockerfile.web`, `Caddyfile` and `compose.yml`; the image holds no credentials (checked by an image search).
- `cloudflared`, Caddy and the backend share one network namespace; restart policy `unless-stopped`.

### S9 — OpenTofu for UAT — IAC, GATE
- `infra/modules/{edge,host,backup}` and `infra/uat`, remote state in an R2 bucket, the zone imported, Access policy from a variable.
- A plan shows drift; an apply on an empty account recreates UAT. Includes validating the provider attributes that the PoC left unproven.

### S10 — CI and UAT deploy — PROMO, CONF
- `check` on pull requests (ffmpeg installed, temporary `DB_PATH`/`PROJECTS_ROOT`, no `.secrets.json`; known timing-sensitive `orchestrator.test.ts` addressed or quarantined).
- Build once per tree on push to `feature/entrega-2-JAME`, push to GHCR, deploy to UAT by digest with stop-then-start, smoke check through an Access service token.
- Provider keys per environment as GitHub Environment secrets; separate UAT keys where a provider allows it, else recorded as shared.

### S11 — Backup and restore drill — STORE
- Scheduled `sqlite3 .backup` and `restic` to `<env>-backup`; recovery point recorded as a number.
- A restore into an empty volume is performed once on UAT, timed and recorded, before production goes live. Alert when the last backup is older than twice its interval.

### S12 — Production with gated promotion — PROMO, GATE, STORE
- `infra/prod` and the apex hostname; `deploy-prod` on push to `main` resolves the UAT-recorded digest for `main`'s tree hash and **fails closed** if none exists; a required reviewer approves.
- A scratch-repository rehearsal proves both the pass and the fail-closed case before the first real promotion.

### S13 — Health and alerting — ONE, EVID
- External uptime check on `GET /health` with an Access service token; email alert on failure.
- Docker `local` log driver with rotation; retention recorded.

## Recorded risks not turned into stories
- A restart **during** a running stage was not exercised in the PoC (stubbed stages finish in about a second); S10's UAT runs with real providers are the first real test (`EVID`).
- Unattended progress was verified only as "no browser connected"; there is no platform sleep under option A.
- B+ (Cloudflare Containers with Litestream and R2) is the documented runner-up and was never run.
