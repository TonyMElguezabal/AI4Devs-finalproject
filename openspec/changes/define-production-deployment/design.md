# Design — Define the production and UAT deployment

## Context

Vid4You runs today as two local processes: a Vite dev server for the React frontend and a Fastify backend started with `node src/server.ts` (strip-only TypeScript, no build step). The backend owns everything stateful:

- the SQLite store at `DB_PATH` (`node:sqlite`, WAL mode) and the media tree at `PROJECTS_ROOT`: MP3, timestamps, images, clips and the final MP4, never deleted automatically (ADR 0002, PRD §12.2);
- the orchestrator, the retry scheduler (`setTimeout` timers), the per-stage concurrency cap held in memory, and `reconcileOnBoot`, which resumes in-flight work after a restart (PRD §12.1);
- one SSE stream per open session page, `GET /events?sessionId=`, with a heartbeat and resync on reconnect (ADR 0003);
- assembly through ffmpeg/ffprobe, called at the hard-coded paths `/opt/homebrew/bin/ffmpeg` and `/opt/homebrew/bin/ffprobe` (`backend/src/ffmpegAssemblyTool.ts:13-14`);
- four provider credentials (`OPENAI_KEY`, `ELEVENLABS_KEY`, `FAL_API_KEY`, `RUNNINGHUB_API_KEY`), read from the environment first and from a git-ignored `.secrets.json` second (`config/credentials.ts`);
- switches that must never be on in production: `ALLOW_TEST_ENDPOINTS` and `USE_STUB_*`;
- an existing `GET /health` route (`routes.ts`), CORS open to any origin (`origin: true`), and a 50 MB body limit.

The frontend is a static Vite build whose API address is fixed at build time: `VITE_API_BASE`, defaulting to `http://127.0.0.1:3100` (`frontend/src/api/client.ts:6`).

The product decision this change runs into is PRD §2.3, §12.3 and D07: the MVP is a local single-user install with no accounts, and exposure beyond a local environment requires defining authentication first. The ticket (JOS-194) asks for production on Cloudflare, a UAT environment fed by a new `uat` branch with the same code, CI/CD, and Terraform or similar.

There is no CI today (`.github/` holds only agent prompts), and `docs/development_guide.md` still describes the setup of an unrelated earlier project.

## Goals / Non-Goals

**Goals:**

- One hosting decision for frontend and backend, made against explicit gates and recorded in ADR 0007 with its evidence and cost.
- An access gate that makes exposure acceptable without adding accounts, plus the PRD change that authorises it.
- An environment model in which production runs exactly what UAT validated.
- A CI/CD and infrastructure-as-code shape that later stories can implement without reopening the platform question.
- A proof of concept showing that a session survives a backend restart on the chosen platform, with live updates through the edge.
- A specified list of follow-up stories.

**Non-Goals:**

- Accounts, roles or authorization inside the application.
- Horizontal scaling, high availability, or any change to the single-process orchestration.
- Real provider calls in the proof of concept.
- Making UAT or production live. That happens in the follow-up stories, after the PRD change is approved.
- Changing product behaviour or the API contract.

## Decisions

**Decision 1 — Set the must-pass gates before comparing platforms.**
An option is only scored if it can meet all of these:
- (G1) exactly one long-lived backend process that is not stopped while a session is processing;
- (G2) durable storage for `DB_PATH` and `PROJECTS_ROOT` that survives a restart, a redeploy and a host replacement (the last one via backup);
- (G3) long-lived SSE responses through the edge;
- (G4) a Linux runtime with ffmpeg/ffprobe and Node ≥ 22.5;
- (G5) an access gate covering both the page and the API;
- (G6) per-environment secrets kept out of the image.

*Alternatives:* scoring the options on general merits (rejected: the platforms differ mostly in exactly these properties, so leaving them implicit hides the deciding facts); treating the ticket's "containers, Kubernetes" as the shortlist (rejected: the ticket asks which option is best, not which of those two).

**Decision 2 — Evaluate four backend options and score the survivors.**
- **A — Cloudflare Tunnel to one container host with a persistent volume.** The backend runs as a single container on a small VM. `cloudflared` publishes it without opening inbound ports. Cloudflare provides DNS, TLS, Access and the edge.
- **B — Cloudflare Containers.** The backend image runs on Cloudflare's container runtime behind a Worker or Durable Object.
- **C — Workers-native rewrite.** Hono on Workers, D1 for the store, R2 for media, Durable Objects or Workflows for orchestration and timers.
- **D — Kubernetes**, any managed offering, with a StatefulSet of one replica and a persistent volume claim.

Weighted criteria for the options that pass the gates:
- data durability and backup: 25%
- application code change required: 20%
- deploy, rollback and same-artifact promotion: 20%
- operational load for a single maintainer: 20%
- monthly cost for two environments: 15%

*Hypothesis, to be confirmed or overturned by the evaluation:* A leads. It needs the least code change and keeps the store on a real disk. B's fit depends on whether its disk is durable across restarts and deploys and whether an instance can be kept running through a long session. Both are checked against current Cloudflare documentation, not assumed. C fails the "MVP is done" premise: it rewrites persistence, orchestration and timers. D meets the gates but brings a control plane, manifests and cluster upgrades for one process, so it is expected to lose on operational load and cost.
*Alternatives:* deciding on A without scoring (rejected: the ticket asks for the best option with evidence, and B is Cloudflare-native enough that dismissing it unexamined would be a preference, not a finding).

**Decision 3 — Evaluate the frontend placement separately: Pages, or served by the backend.**
Two placements are compared.
- **(F1)** Cloudflare Pages hosts the static build, and the API is reached at a separate hostname.
- **(F2)** The backend serves the built frontend itself, so each environment is one image on one hostname, with the API under `/api` on the same origin.

F2 removes cross-origin requests entirely: CORS becomes unnecessary, the SSE stream carries the Access cookie without `withCredentials`, and one Access application covers everything. The frontend build no longer depends on the environment (a relative API base), and UAT and production run literally the same artifact. The cost is a static-file route in the backend and the loss of Pages' CDN for static assets, which matters little for a single-user tool.
*To verify in the evaluation:* whether F1 can route `/api/*` on the Pages hostname to the backend (for example through a Worker route) to get the same-origin benefits, and what that adds in moving parts.
*Alternatives:* F1 with a per-environment build and restricted CORS (kept as the fallback; it is the conventional layout, but it gives up "same artifact" for the frontend and needs Access to work across two origins).

**Decision 4 — Gate exposure with Cloudflare Access, and change the PRD before going live.**
Each environment's hostname or hostnames sit behind a Cloudflare Access application, with a policy that allows a named email list (one-time PIN or an identity provider). Every request without an allowed identity is stopped at the edge, including direct API calls. The application itself stays account-free, which keeps the MVP's §2.1 single-role model. This change drafts the PRD text for §2.3, §12.3 and D07 ("hosted single-user install behind an edge access gate") and stops before any production hostname is published until the product owner approves it.
*Alternatives:* in-app authentication (rejected for this change: it is a new product capability that PRD §2.3 puts outside the MVP and would need its own story); relying on an unguessable URL (rejected: the API has no authorization at all, so anyone who learns the URL controls every session); HTTP basic auth at a reverse proxy (rejected: it works, but it puts credentials in a config file and offers no per-person revocation, where Access does both at no code cost).

**Decision 5 — One backend instance, deployed by stop-then-start.**
Each environment runs exactly one backend container. A deploy stops the old container (giving in-flight requests a short grace period), then starts the new one. On boot, `reconcileOnBoot` resumes in-flight work, and open pages reconnect and resync through the ADR 0003 rule. A downtime of a few seconds per deploy is accepted.
*Alternatives:* rolling or blue-green deploys (rejected: two processes against one SQLite file would run two orchestrators, two retry schedulers and two concurrency caps at once, which breaks the single-instance assumption that `define-backend-stack` and the restart-safe concurrency spec rest on); auto-scaling (rejected for the same reason).

**Decision 6 — Store data on a host volume and back it up off-host.**
`DB_PATH` and `PROJECTS_ROOT` live on a volume that outlives the container. Backups run on a schedule:
- the SQLite store is copied with SQLite's online backup (`VACUUM INTO` or the backup API), never by copying the live `.sqlite`/`-wal` files;
- `PROJECTS_ROOT` is synced incrementally;
- both go to an off-host bucket (leading candidate: R2, so the data stays inside the same account).

A restore into an empty environment is done once during the proof of concept and timed. The backup interval sets the maximum data loss and is recorded as such.
*Alternatives:* storing media in R2 directly instead of on disk (rejected for now: every file path, the download routes and the assembly tool assume a local filesystem, so this would be a storage rework, not a deployment); no backups because the volume is "durable" (rejected: a volume survives restarts, not deleting the wrong resource or losing the host).

**Decision 7 — `uat` and `main` as environment branches, promoted by image digest.**
- UAT deploys from `uat` and production from `main`.
- Feature work keeps flowing through the integration branch. `uat` is updated from it by pull request, and `main` is updated from `uat` by a fast-forward merge only, so production deploys a commit that UAT already ran.
- CI builds the backend image (with the frontend inside it under F2) once per commit, tags it with the commit SHA, and pushes it to a registry (leading candidate: GitHub Container Registry).
- The production job deploys the **digest** recorded by the UAT deploy for that SHA; it never rebuilds.

Where `uat` is first branched from is an open question, because MVP work currently integrates into `feature/entrega-2-JAME` rather than `main`.
*Alternatives:* rebuilding for production from `main` (rejected: two builds of one commit can differ through dependency resolution or base-image updates, and then UAT has not validated what ships); a single trunk with environment tags instead of branches (a valid design, but the ticket explicitly asks for a `uat` branch, so it is recorded as the alternative rather than chosen).

**Decision 8 — GitHub Actions for CI/CD, GitHub Environments for approval and secrets.**
- On every pull request: backend and frontend `typecheck` and `test`. The backend tests run with temporary `DB_PATH`/`PROJECTS_ROOT` directories and no `.secrets.json`, so a test that only passes with a developer's local keys fails in CI instead of passing silently.
- On merge to `uat`: build, push and deploy to UAT.
- On a fast-forward to `main`: deploy the recorded digest to production after a required reviewer approves in the `production` GitHub Environment.
- Provider credentials and deploy keys live as secrets in the `uat` and `production` GitHub Environments and are written to the host's environment at deploy time, never into the image.

*Alternatives:* Cloudflare-native builds (rejected for the backend: Pages builds cover only the frontend); a self-hosted CI (rejected: more to operate, nothing gained).

**Decision 9 — Terraform for the infrastructure, with state off any laptop.**
Terraform with the Cloudflare provider declares DNS records, the Tunnel and its ingress (or the Containers setup under B), the Access application and policy, the backup bucket, and Pages if F1 is chosen. Under A, the VM is declared with its own provider in the same configuration. State lives in a remote backend (leading candidate: an R2 bucket through the S3-compatible backend), with one workspace or directory per environment. Secret values are passed in at apply time, never committed.
*Alternatives:* Pulumi (equivalent capability; rejected only because Terraform is what the ticket names and what the Cloudflare docs cover first); click-ops in the dashboard (rejected: the ticket asks for infrastructure as code, and hand-made resources cannot be recreated or reviewed).

**Decision 10 — Close configuration gaps through follow-up stories, and work around them in the proof of concept.**
The spike does not change product code. The proof-of-concept image works around the hard-coded ffmpeg paths by linking the distribution's ffmpeg/ffprobe to `/opt/homebrew/bin/`. It sets `VITE_API_BASE` (or uses F2's relative base) at build time. The real fixes become follow-up stories:
- configurable `FFMPEG_PATH`/`FFPROBE_PATH`, defaulting to the binaries on `PATH`;
- a frontend API base that fits multiple environments;
- CORS restricted to the environment's origin, if F1 is chosen;
- production refusing to start with `ALLOW_TEST_ENDPOINTS` or any `USE_STUB_*` set.

*Alternatives:* fixing them inside this change (rejected: it mixes a spike with product changes and skips their TDD cycle; each fix is small but deserves its own failing test first).

**Decision 11 — Minimal observability, using what already exists.**
- Health: the existing `GET /health`, checked by the container's health check and by an external uptime check that alerts by email.
- Logs: Fastify's JSON logs go to stdout, are retained on the host with rotation, and are searchable there.

Anything beyond this (metrics, tracing, a log platform) is recorded as optional follow-up work, not designed here.
*Alternatives:* adopting a hosted log or metrics service now (rejected: a single-user tool with one process does not yet have the volume or the on-call rotation that would justify it).

**Decision 12 — The proof of concept is throwaway and lives inside this change.**
The Dockerfile, the Terraform sketch, the workflow sketch and the run notes go under `openspec/changes/define-production-deployment/poc/`. The proof of concept uses a temporary hostname, a test Access policy and stubbed providers. Every paid or account-level resource it creates is listed and torn down at the end of the timebox, unless the follow-up stories adopt it explicitly.
*Alternatives:* building the real pipeline directly (rejected: it commits to a platform before the evidence exists, and it would ship before the PRD change is approved).

**Decision 13 — Record the decision in ADR 0007 unconditionally.**
Every later deployment story and every future maintainer depends on this choice, and none of them will be in the room.

## Risks / Trade-offs

- **The PRD change is not approved** → The spike still delivers the ADR, the PoC and the stories. Production stays unpublished, and the stories that would publish it are marked blocked on the PRD decision.
- **SSE through the Cloudflare edge is cut by an idle or response timeout** → Run the proof of concept with a quiet stretch longer than the documented proxy timeout. ADR 0003's 15-second heartbeat should keep the stream alive; if it does not, record it and adjust the heartbeat, not the transport.
- **Access breaks the SSE stream or the downloads** → Covered by Decision 3. Under F2 everything is same-origin, so the Access cookie travels with both. Under F1 it must be shown working cross-origin in the proof of concept, or F1 loses.
- **The single VM is a single point of failure** → Accepted for a single-user MVP. Backups bound the data loss, and Terraform plus a restore bound the recovery time. Both are measured and recorded, not promised.
- **The backup copies a half-written SQLite file** → Use SQLite's online backup only, and prove it with the restore drill.
- **UAT on real providers costs money on every test run** → Recorded as an open question. The default is stubs in UAT, with real providers enabled per test campaign.
- **Uploads hit an edge body-size limit before Fastify's 50 MB one** → Check the plan's request-size limit and record which limit a user would meet first.
- **The proof of concept passes only because of the ffmpeg symlink or a stub** → Name every such stand-in in the evidence report, the same discipline earlier spikes used.
- **Cloudflare Containers' capabilities change quickly** → Evaluate option B against the documentation current on the evaluation date and record that date in the ADR.

## Migration Plan

Nothing is deployed today, so there is nothing to migrate. The rollout belongs to the follow-up stories, and its order is set here:

1. Product-owner approval of the PRD access change.
2. Configuration fixes (ffmpeg paths, API base, production start guards).
3. Terraform for UAT.
4. CI and the UAT deploy.
5. Backup and the restore drill on UAT.
6. Terraform and approval-gated promotion to production.

Rollback of a deploy is redeploying the previous image digest. A schema migration that cannot run backwards is restored from the pre-deploy backup.

## Open Questions

1. **Where does `uat` branch from?** MVP work integrates into `feature/entrega-2-JAME`, not `main`. Either `entrega-2` is merged into `main` first and `uat` is cut from `main`, or `uat` is cut from `entrega-2` now. This needs the product owner's call.
2. **Which domain is used?** Is a domain already managed in the Cloudflare account, and which hostnames should UAT and production use?
3. **Who is on the Access allowlist** for UAT and for production, and is one-time PIN by email enough, or is an identity provider required?
4. **Does UAT use real providers?** And if so, under what budget?
5. **What monthly budget is acceptable** for two environments? This decides between options A and B as much as the technical fit does.
