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

The product decision this change runs into is PRD §2.3, §12.3 and D07: the MVP is a local single-user install with no accounts, and exposure beyond a local environment requires defining authentication first. The ticket (JOS-194) asks for production on Cloudflare, a UAT environment with the same code, CI/CD, and Terraform or similar. The product owner later fixed the environments at two, mapped to existing branches: UAT to `feature/entrega-2-JAME`, production to `main` (§ Execution Record §1).

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
- (G1) exactly one backend process at a time, and a deploy never interrupts a processing session without the boot-time resume. A platform-initiated restart is tolerated, because the application resumes from persisted state (PRD §12.1, `reconcileOnBoot`), but only together with G2;
- (G2) durable storage for `DB_PATH` and `PROJECTS_ROOT` that survives a restart, a redeploy and a host replacement (the last one via backup);
- (G3) long-lived SSE responses through the edge;
- (G4) a Linux runtime with ffmpeg/ffprobe and Node ≥ 22.5;
- (G5) an access gate covering both the page and the API;
- (G6) per-environment secrets kept out of the image;
- (G7) the backend runs in the Cloudflare account, because the ticket asks to "deploy the application in dash.cloudflare.com and consider this the production environment". Compute that only sits behind Cloudflare's edge does not satisfy it. The product owner may waive this gate; the evaluation records which options depend on the waiver. **Waived on 2026-10-12**: the product owner chose option A, accepting Cloudflare as the edge (DNS, Tunnel, Access, TLS) with the compute on a VM outside Cloudflare.

*Alternatives:* scoring the options on general merits (rejected: the platforms differ mostly in exactly these properties, so leaving them implicit hides the deciding facts); treating the ticket's "containers, Kubernetes" as the shortlist (rejected: the ticket asks which option is best, not which of those two).

**Decision 2 — Evaluate five backend options and score the survivors.**
- **A — Cloudflare Tunnel to one container host with a persistent volume.** The backend runs as a single container on a small VM. `cloudflared` publishes it without opening inbound ports. Cloudflare provides DNS, TLS, Access and the edge, but the VM is outside Cloudflare (fails G7 unless waived).
- **B — Cloudflare Containers, as is.** The backend image runs on Cloudflare's container runtime behind a Worker or Durable Object, on the instance's own disk.
- **B+ — Cloudflare Containers with externalised state.** As B, but the SQLite file is replicated to R2 by Litestream and restored at boot, and `PROJECTS_ROOT` is an R2 bucket mounted through FUSE (Cloudflare's documented `tigrisfs` pattern). A Durable-Object-side keep-alive stops the instance sleeping while work is in flight.
- **C — Workers-native rewrite.** Hono on Workers, D1 for the store, R2 for media, Durable Objects or Workflows for orchestration and timers.
- **D — Kubernetes**, any managed offering, with a StatefulSet of one replica and a persistent volume claim.

Weighted criteria for the options that pass the gates:
- data durability and backup: 30%
- application code change required: 25%
- deploy, rollback and same-artifact promotion: 25%
- operational load for a single maintainer: 20%

Cost is not a criterion for now (product-owner decision, § Execution Record §1). The monthly estimate per environment is still recorded in the ADR for information, so that a later budget limit can re-score the options without redoing the research.

*Hypothesis (initial, superseded by § Execution Record §3):* A leads, because it needs the least code change and keeps the store on a real disk. The evaluation overturned the premise that A is the whole answer: A fails G7, and B fails G2 on its own, which is why B+ was added as a fifth option.
**Outcome (2026-10-12, product owner): option A.** The product owner accepted Cloudflare-as-edge, which waives G7, so A's technical lead (7.40 vs 6.70) decides. B+ becomes the documented runner-up and is not built. The Containers-specific unknowns (keep-alive, FUSE durability, Litestream window) are no longer decision inputs and are not run as experiments.
*Alternatives:* deciding on A without scoring (rejected: the ticket asks for the best option with evidence, and Cloudflare-native options are close enough to the ticket's wording that dismissing them unexamined would be a preference, not a finding).

**Decision 3 — Evaluate the frontend placement separately: Pages, or served by the backend.**
Three placements are compared.
- **(F1)** Cloudflare Pages hosts the static build, and the API is reached at a separate hostname.
- **(F2)** The backend serves the built frontend itself, so each environment is one image on one hostname, with the API under `/api` on the same origin.
- **(F3)** One Worker per environment serves the static build as Workers static assets and forwards `/api/*` (prefix stripped) to the backend, so there is one hostname and one origin without any product code serving files. Only available where a Worker fronts the backend (options B and B+).
- **(F4)** A small reverse proxy (Caddy) runs next to the backend on the VM, serves the static build and forwards `/api/*` (prefix stripped) to `127.0.0.1:3100`, with response flushing disabled for SSE. Same origin and no product code serving files, like F3, for option A.

F2 removes cross-origin requests entirely: CORS becomes unnecessary, the SSE stream carries the Access cookie without `withCredentials`, and one Access application covers everything. The frontend build no longer depends on the environment (a relative API base), and UAT and production run literally the same artifact. The cost is a static-file route in the backend and the loss of Pages' CDN for static assets, which matters little for a single-user tool.
*To verify in the evaluation:* whether F1 can route `/api/*` on the Pages hostname to the backend (for example through a Worker route) to get the same-origin benefits, and what that adds in moving parts.
*Alternatives:* F1 with a per-environment build and restricted CORS (kept as the fallback; it is the conventional layout, but it gives up "same artifact" for the frontend and needs Access to work across two origins).

**Decision 4 — Gate exposure with Cloudflare Access, and change the PRD before going live.**
Each environment's hostname or hostnames sit behind a Cloudflare Access application, with a policy that allows an explicit email list declared in Terraform. The list currently holds one address, the product owner's, for both environments. Login uses Access's one-time PIN by email, which needs no identity-provider setup; an identity provider can replace it later without touching the application. Every request without an allowed identity is stopped at the edge, including direct API calls. Under option A the VM is outside Cloudflare, so Access only protects the hostname: the host SHALL publish no inbound port at all (the Tunnel's connector dials out), and the provider's firewall denies all inbound traffic, so the gate cannot be bypassed by using the VM's address. The application itself stays account-free, which keeps the MVP's §2.1 single-role model. This change drafts the PRD text for §2.3, §12.3 and D07 ("hosted single-user install behind an edge access gate") and stops before any production hostname is published until the product owner approves it.
*Alternatives:* in-app authentication (rejected for this change: it is a new product capability that PRD §2.3 puts outside the MVP and would need its own story); relying on an unguessable URL (rejected: the API has no authorization at all, so anyone who learns the URL controls every session); HTTP basic auth at a reverse proxy (rejected: it works, but it puts credentials in a config file and offers no per-person revocation, where Access does both at no code cost).

**Decision 5 — One backend instance, deployed by stop-then-start.**
Each environment runs exactly one backend container. A deploy stops the old container (giving in-flight requests a short grace period), then starts the new one. On boot, `reconcileOnBoot` resumes in-flight work, and open pages reconnect and resync through the ADR 0003 rule. A downtime of a few seconds per deploy is accepted.

Platform-initiated restarts are accepted for the same reason: Cloudflare Containers states that it "does not guarantee that any container instance will run for a set period" and that host restarts happen "on an irregular cadence", and the application was built to resume (PRD §12.1). What the platform restart must not do is lose the store, which is G2's job. Where the platform sleeps idle instances, an explicit keep-alive must count in-flight background work as activity, because the backend progresses sessions with no incoming request.
*Alternatives:* rolling or blue-green deploys (rejected: two processes against one SQLite file would run two orchestrators, two retry schedulers and two concurrency caps at once, which breaks the single-instance assumption that `define-backend-stack` and the restart-safe concurrency spec rest on); auto-scaling (rejected for the same reason).

**Decision 6 — Store data on a host volume and back it up off-host.**
`DB_PATH` and `PROJECTS_ROOT` live on a volume that outlives the container. Backups run on a schedule:
- the SQLite store is copied with SQLite's online backup (`VACUUM INTO` or the backup API), never by copying the live `.sqlite`/`-wal` files;
- `PROJECTS_ROOT` is synced incrementally;
- both go to an off-host bucket (leading candidate: R2, so the data stays inside the same account).

A restore into an empty environment is done once during the proof of concept and timed. The backup interval sets the maximum data loss and is recorded as such.
*Alternatives:* storing media in R2 directly instead of on disk (rejected for now: every file path, the download routes and the assembly tool assume a local filesystem, so this would be a storage rework, not a deployment); no backups because the volume is "durable" (rejected: a volume survives restarts, not deleting the wrong resource or losing the host).

**Decision 7 — Two fixed environments mapped to existing branches, promoted by source tree.**
- Exactly two environments exist. UAT deploys from `feature/entrega-2-JAME`, the branch feature work already merges into. Production deploys from `main`. No `uat` branch is created.
- The branch-to-environment mapping is declared once (for example, a small map at the top of the workflow or a repository variable). Every job reads it from there, so a future remapping is a one-line change (product-owner note: the mapping may change later).
- CI builds the backend image (with the frontend inside it under F2) once for a source tree and pushes it to a registry (leading candidate: GitHub Container Registry). The image is tagged with the tree hash (`git rev-parse HEAD^{tree}`) as well as the commit SHA, and the UAT deploy records which digest it ran for that tree.
- The production job computes `main`'s tree hash and deploys the digest UAT recorded for it. If no UAT-run image exists for that tree, the job fails; it never builds.

Why the tree and not the commit: GitHub merges into `main` create a new commit SHA, so a SHA-keyed lookup would never find the UAT image. The tree hash is identical whenever `main` holds exactly what UAT ran. That is the case for a fast-forward, which is possible today because `main` is 0 commits ahead of `feature/entrega-2-JAME`. It is also the case for a merge commit when `main` has nothing UAT lacks. History shows both kinds of merge into `main` (some PR merges produced a tree different from the merged branch), so the fail-closed check is what guarantees the rule, not the merge style.
*Alternatives:* rebuilding for production from `main` (rejected: two builds of one source can differ through dependency resolution or base-image updates, and then UAT has not validated what ships); keying by commit SHA and requiring fast-forward-only merges (rejected: GitHub's merge button cannot enforce it, so the rule would rest on discipline); creating a separate `uat` branch (rejected by the product owner: the integration branch already plays that role).

**Decision 8 — GitHub Actions for CI/CD, GitHub Environments for approval and secrets.**
- On every pull request: backend and frontend `typecheck` and `test`. The backend tests run with temporary `DB_PATH`/`PROJECTS_ROOT` directories and no `.secrets.json`, so a test that only passes with a developer's local keys fails in CI instead of passing silently.
- On a push to the UAT branch (`feature/entrega-2-JAME`): build, push and deploy to UAT.
- On a push to `main`: resolve the UAT-recorded digest for `main`'s tree and deploy it to production after a required reviewer approves in the `production` GitHub Environment.
- Provider credentials and deploy keys live as secrets in the `uat` and `production` GitHub Environments and are written to the host's environment at deploy time, never into the image. UAT runs real providers (product-owner decision), so it gets its own provider keys wherever a provider allows more than one, which keeps UAT spend visible separately from production.

*Alternatives:* Cloudflare-native builds (rejected for the backend: Pages builds cover only the frontend); a self-hosted CI (rejected: more to operate, nothing gained).

**Decision 9 — Terraform for the infrastructure, with state off any laptop.**
Terraform with the Cloudflare provider declares DNS records, the Tunnel and its ingress (or the Containers setup under B), the Access application and policy, the backup bucket, and Pages if F1 is chosen. Under A, the VM is declared with its own provider in the same configuration; the VM provider is Hetzner Cloud, chosen by the product owner on 2026-10-12 (small x86_64 Linux VM, first-class Terraform provider). Hosted environments get one VM each, so UAT and production never share a host or a volume. State lives in a remote backend (leading candidate: an R2 bucket through the S3-compatible backend), with one workspace or directory per environment. Secret values are passed in at apply time, never committed.
*Alternatives:* Pulumi (equivalent capability; rejected only because Terraform is what the ticket names and what the Cloudflare docs cover first); click-ops in the dashboard (rejected: the ticket asks for infrastructure as code, and hand-made resources cannot be recreated or reviewed).

**Decision 9b — One Cloudflare-registered domain, `vid4you.download`, with one hostname per environment.**
The product owner registered `vid4you.download` through Cloudflare Registrar on 2026-10-12, so the zone lives in the same account as Tunnel, Access and DNS. Hostnames:
- production: the apex, `vid4you.download`;
- UAT: `uat.vid4you.download`;
- proof of concept: `poc.vid4you.download`, temporary and deleted at teardown.

Buying the domain was a one-off manual step, because Terraform does not purchase domains. From now on, Terraform manages the zone's records and Access applications; the zone itself is imported, not created.
*To verify in the evaluation:* the apex needs a record type the chosen option supports. A Tunnel route on the apex works through Cloudflare's CNAME flattening, and a Pages custom domain on the apex must be checked. Record the result.
*Alternatives:* free platform subdomains only (`*.pages.dev`, `*.workers.dev`) (rejected for production: the address would be tied to one platform choice, and changing platforms would change the URL); a domain bought from another registrar (works, but adds a nameserver hand-over step and a second account to manage).

**Decision 10 — Close configuration gaps through follow-up stories, and work around them in the proof of concept.**
The spike does not change product code. The proof-of-concept image works around each gap without editing `backend/src`:
- the hard-coded ffmpeg paths, by linking the distribution's ffmpeg/ffprobe to `/opt/homebrew/bin/`;
- the missing assembly wiring, by a preload module (`node --import poc/preload.ts src/server.ts`) that registers the real ffmpeg adapter and any stub providers before the server starts;
- the loopback-only listen address, by a `socat` shim in the container that forwards `0.0.0.0:8080` to `127.0.0.1:3100`;
- the unwired decomposition hand-off (finding 5 below), by the test endpoint `POST /internal/test/quick-scene`, enabled in the PoC environment only, which registers a scene directly and launches the video stage;
- `VITE_API_BASE`, by setting it at build time (or using F2's relative base).

The real fixes become follow-up stories:
- **wire the real assembly tool at bootstrap**: `createFfmpegAssemblyTool()` is exported but never called, so without a stub flag every session fails at assembly with "no assembly tool is configured" (finding §1.2);
- configurable `FFMPEG_PATH`/`FFPROBE_PATH`, defaulting to the binaries on `PATH`;
- a `HOST` setting for the listen address (default `127.0.0.1`), because the backend binds loopback only;
- a frontend API base that fits multiple environments;
- CORS restricted to the environment's origin, and the SSE route using the same check, because it echoes any request `Origin` into `Access-Control-Allow-Origin` and so ignores the CORS plugin;
- a hosted backend (UAT or production) refusing to start when `ALLOW_TEST_ENDPOINTS` or any `USE_STUB_*` variable is **present**, whatever its value: today any non-empty value enables them, including `false` and `0`, and an unrecognised `USE_STUB_VIDEO_PROVIDER` value silently activates the `transient-failure` stub.

*Alternatives:* fixing them inside this change (rejected: it mixes a spike with product changes and skips their TDD cycle; each fix is small but deserves its own failing test first).

**Decision 11 — Minimal observability, using what already exists.**
- Health: the existing `GET /health`, checked by the container's health check and by an external uptime check that alerts by email.
- Logs: Fastify's JSON logs go to stdout, are retained on the host with rotation, and are searchable there.

Anything beyond this (metrics, tracing, a log platform) is recorded as optional follow-up work, not designed here.
*Alternatives:* adopting a hosted log or metrics service now (rejected: a single-user tool with one process does not yet have the volume or the on-call rotation that would justify it).

**Decision 12 — The proof of concept is throwaway and lives inside this change.**
The Dockerfile, the Terraform sketch, the workflow sketch and the run notes go under `openspec/changes/define-production-deployment/poc/`. The proof of concept uses a temporary hostname and the same Access policy as the real environments. Under option A the host is a developer machine running the same image and `cloudflared` in containers, standing in for the VM (recorded as a stand-in); what the edge, Access, SSE, restart and backup experiments show does not depend on which machine the container runs on, so no VM provider account is needed to decide. Its restart, redeploy and idle experiments run on stubbed providers, so they are repeatable and cheap. One extra session runs on real providers, to prove that secrets reach the container and that real ffmpeg assembly works on Linux (UAT will do the same on every run, with no spending cap per product-owner decision). Every paid or account-level resource it creates is listed and torn down at the end of the timebox, unless the follow-up stories adopt it explicitly.
*Alternatives:* building the real pipeline directly (rejected: it commits to a platform before the evidence exists, and it would ship before the PRD change is approved).

**Decision 13 — Record the decision in ADR 0007 unconditionally.**
Every later deployment story and every future maintainer depends on this choice, and none of them will be in the room.

## Risks / Trade-offs

- **The PRD change is not approved** → The spike still delivers the ADR, the PoC and the stories. Production stays unpublished, and the stories that would publish it are marked blocked on the PRD decision.
- **SSE through the Cloudflare edge is cut by an idle or response timeout** → Run the proof of concept with a quiet stretch longer than the documented proxy timeout. ADR 0003's 15-second heartbeat should keep the stream alive; if it does not, record it and adjust the heartbeat, not the transport.
- **Access breaks the SSE stream or the downloads** → Covered by Decision 3. Under F2 everything is same-origin, so the Access cookie travels with both. Under F1 it must be shown working cross-origin in the proof of concept, or F1 loses.
- **The single VM is a single point of failure** → Accepted for a single-user MVP. Backups bound the data loss, and Terraform plus a restore bound the recovery time. Both are measured and recorded, not promised.
- **The backup copies a half-written SQLite file** → Use SQLite's online backup only, and prove it with the restore drill.
- **UAT on real providers costs money on every run, with no cap** → Accepted by the product owner. Separate UAT keys where possible keep the spend attributable, and the ADR records which providers cannot separate it.
- **Main is merged with content UAT never ran** → The production job finds no image for that tree and fails closed (Decision 7). The fix is to bring that content through UAT first, never to build for production.
- **Uploads hit an edge body-size limit before Fastify's 50 MB one** → Check the plan's request-size limit and record which limit a user would meet first.
- **The proof of concept passes only because of the ffmpeg symlink or a stub** → Name every such stand-in in the evidence report, the same discipline earlier spikes used.
- **Cloudflare Containers' capabilities change quickly** → Evaluate option B against the documentation current on the evaluation date and record that date in the ADR. B+ is the documented runner-up; revisit it if the VM's operating load proves too high.
- **The VM is reachable around the gate** → The host publishes no inbound port and the provider firewall denies all inbound traffic; the PoC probes the host's address to prove it.
- **Operating system and Docker are unpatched on a long-lived VM** → Automatic security updates on the host, and replacing the VM from Terraform plus a restore bounds the exposure; checked in the follow-up story, not designed further here.

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

1. ~~Where does `uat` branch from?~~ **Answered:** no `uat` branch; UAT = `feature/entrega-2-JAME`, production = `main` (Decision 7).
2. ~~Which domain is used?~~ **Answered:** `vid4you.download`, registered through Cloudflare on 2026-10-12; production on the apex, UAT on `uat.` (Decision 9b).
3. ~~Who is on the Access allowlist?~~ **Answered:** the product owner's address only, for both environments; one-time PIN by email (Decision 4).
4. ~~Does UAT use real providers?~~ **Answered:** yes, with no spending cap for now.
5. ~~What monthly budget is acceptable?~~ **Answered:** cost is not a constraint for now; it is dropped from the scoring and recorded for information only (Decision 2).
6. ~~Must the compute run inside Cloudflare?~~ **Answered (2026-10-12):** no; option A, Cloudflare as the edge (Decision 1, G7 waived).
7. ~~Which VM provider hosts UAT and production?~~ **Answered (2026-10-12):** Hetzner Cloud (`hcloud` Terraform provider). The earlier answer "Cloudflare" was clarified: Cloudflare has no general-purpose VM product, and floci.io (suggested next) is a local cloud emulator, not a host. The product owner creates and pays for the account (story S7); the proof of concept does not need it.

## Execution Record

### §1 — Product-owner answers (2026-10-12)

- Environments: always exactly two, UAT and production. UAT deploys from `feature/entrega-2-JAME`, production from `main`. The mapping may change in the future, so it is declared in one place.
- Git state at the time of the answer: `main` is 0 commits ahead of and 439 commits behind `feature/entrega-2-JAME`, so the first promotion can be a fast-forward.
- Access allowlist: one address, the product owner's, for both environments.
- Providers: UAT calls the real providers; no spending cap for now.
- Domain: `vid4you.download`, registered by the product owner through Cloudflare Registrar on 2026-10-12 (whois: registrar Cloudflare, nameservers `konnor`/`maeve.ns.cloudflare.com`). Production on the apex, UAT on `uat.vid4you.download`, proof of concept on `poc.vid4you.download` (Decision 9b).
- Hosting cost: not a concern for now; removed from the scoring weights.
- Nothing still open from the product owner.

### §1.2 — Constraints re-verified against the code (base `2fa63dc`, 2026-10-12)

Confirmed unchanged from § Context: environment variables (`PORT`, `DB_PATH`, `PROJECTS_ROOT`, `BODY_LIMIT_BYTES`, `STAGE_CONCURRENCY_LIMIT`, `RETRY_*`, `ALLOW_TEST_ENDPOINTS`, `USE_STUB_*`, `ASSEMBLY_STUB_DELAY_MS`); credentials via `loadCredential` (env wins over `.secrets.json`); `GET /health`; SSE at `GET /events` with a 15 s heartbeat; `@fastify/cors` with `origin: true`; 50 MB body limit; ffmpeg/ffprobe at `/opt/homebrew/bin/`; `DB_PATH` and `PROJECTS_ROOT` default to paths relative to the working directory (`data/skeleton.sqlite`, `data/projects`), so a container must set both explicitly.

**New findings, not in § Context:**

1. **The real assembly tool is never wired.** `createFfmpegAssemblyTool()` (`ffmpegAssemblyTool.ts:26`) has no caller. `server.ts` calls `setAssemblyTool` only when `USE_STUB_ASSEMBLY_TOOL` is set; otherwise `getAssemblyTool()` returns `undefined` and assembly records the failure "no assembly tool is configured". `git log -S` finds only the commit that added the adapter, and no remote branch (`entrega-2`, `main`, the JOS-159 and JOS-164 branches) calls it. As the code stands, **no deployed environment can produce a final video**. This is the largest gap the spike found, and it is a story of its own, not a configuration tweak.
2. **The server listens on `127.0.0.1` only** (`server.ts:134`; there is no `HOST` setting). A container with a published port cannot be reached; a Tunnel connector in the same network namespace can.
3. **`ALLOW_TEST_ENDPOINTS` is truthiness-checked** (`routes.ts:599`): `ALLOW_TEST_ENDPOINTS=false` enables the test endpoints. The same holds for every `USE_STUB_*` flag, and an unknown `USE_STUB_VIDEO_PROVIDER` value selects the `transient-failure` stub. Infrastructure code must leave these variables unset, not set to a falsy string.
4. **The SSE route ignores the CORS allowlist.** It writes `Access-Control-Allow-Origin: <request Origin>` directly on `reply.raw` (`routes.ts:571`), so restricting `@fastify/cors` alone does not close it.
5. **Nothing starts decomposition after the voice-over.** On this base, `runDecompositionPhase` is called only from `decompositionPhase.ts` itself and from the manual retry route (`POST /sessions/:id/decomposition/retry`). A new session reaches `voice-over-complete` and stops: no scenes are registered, so the image, video and assembly stages are never reached through the normal API. `routes.ts:248` says so in a comment ("decomposition (US-07..US-09) hasn't run yet"), and the `decompose-script-into-chunks` change shows 0 of 78 tasks done. This is a product gap (the forward hand-off), not a deployment one, but it bounds what UAT can show: until it lands, a session cannot go from script to final video without the test endpoints.

### §1.3 — Do the stubs exercise real assembly? (task 1.3)

**No.** The stub voice provider emits a silent but valid MP3 (`createSilentMp3`), which ffmpeg decodes. The stub video provider returns a 12-byte `ftyp` header (`server.ts:103`, hex `00000000667479706d703432`), which is not a decodable video, and the stub assembly tool returns `success` with an `outputPath` but never writes the file, so `GET /sessions/:id/download/final-video` would answer `404 final video file not found on disk`. Consequences for the proof of concept:

- A session on the stock stubs reaches `final-video` state but has no downloadable MP4. Tasks 7.2, 10.5 and 11.4 therefore need either a preload that registers a stub video provider returning a small real MP4 (generated by ffmpeg when the image is built) together with the real assembly adapter, or they are recorded as exercised only by the real-provider run in 7.6.
- The image and decomposition stages have no server-level stub flag either (`setImageProviderRegistry` and `setDecompositionDependencies` exist but server bootstrap never calls them), so a stubbed session needs those registered by the same preload.
- Every such preload registration is a **stand-in**, to be named in the evidence report; real assembly on Linux is proven only by 7.6.

**Dry run (2026-10-12, this base, macOS then Linux container).** With `poc/preload.ts` in `POC_MODE=stub`:
- A session created through `POST /sessions` reaches `voice-over-complete` (stub voice produces ~0.99 s of valid silent MP3) and **stops there** (finding 5).
- With `ALLOW_TEST_ENDPOINTS=1`, `quick-scene` registers one scene, the video stub returns the ffmpeg-generated 1 s clip, the real `createFfmpegAssemblyTool()` assembles it, and the session reaches `final-video`. The download answers `200 video/mp4`, 58 KB, h264 1920x1080 + mp3, 1.0 s.
- The same flow ran inside the Linux container built from `poc/Dockerfile` (`POC_LOCAL=1`, arm64 under Colima): real ffmpeg on Debian, through the socat shim. The R2 path (FUSE, Litestream) has **not** been exercised yet; that needs the Cloudflare account.
- A narration shorter than the clip forces a large speed factor; the stub clip is therefore generated at 1 s to match the stub voice.

### §1.4 — Still undecided at this point

The hosting option (A–D), the frontend placement (F1/F2), the exact preload surface the PoC needs, and whether the PRD access change will be approved. Nothing in groups 3–5 has been decided yet; conclusions below are traceable to the facts above.

### §3 — Backend option evaluation (tasks 3.1–3.5; documentation retrieved 2026-10-12)

**Facts established from Cloudflare documentation** (sources are the pages named; Containers is a fast-moving product, so the retrieval date matters):

| Fact | Source |
|---|---|
| Container disk is ephemeral by default; after sleep the next start "uses a fresh disk from the container image" | developers.cloudflare.com/containers/platform-details/architecture/, /containers/faq/ |
| Persistence options: Durable Object storage, **manual** filesystem snapshots (public beta since 2026-09-30, `durable_object` scheduling policy only; consistency and loss window not documented), or R2 through FUSE ("do not expect native SSD-like performance") | /changelog/post/2026-09-30-snapshots/, /containers/faq/, /containers/examples/r2-fuse-mount/ |
| "Cloudflare does not guarantee that any container instance will run for a set period"; host restarts "on an irregular cadence"; no way to pin an instance | /containers/faq/ |
| Stop sequence (deploy rollout, inactivity, destroy): SIGTERM, wait up to 15 minutes, then SIGKILL | /containers/platform-details/architecture/ |
| `sleepAfter` defaults to 10 minutes; "Incoming requests reset the timer"; background work must call `renewActivityTimeout()`; whether an open streaming response counts is **not documented** | /containers/container-class/ |
| Largest instance: standard-4, 4 vCPU, 12 GiB, **20 GB disk**; account limits 1,500 vCPU / 6 TiB / 30 TB | /containers/platform-details/limits/ |
| Proxy limits: read timeout 125 s (Enterprise-configurable), idle timeout 900 s, write timeout 30 s | /fundamentals/reference/connection-limits/ |
| Proxied request body limit by plan: 100 MB (Free, Pro), 200 MB (Business), 500 MB (Enterprise) | Workers limits page (secondary result; zone setting is authoritative) |
| Containers require Workers Paid ($5/month minimum); billed per 10 ms of activity; CPU on active usage | /containers/platform/pricing/ |
| Litestream-to-R2 with restore-at-boot is a documented community pattern; replication is asynchronous, so abrupt termination can lose the last seconds of writes; it covers only the SQLite files | third-party write-ups (OpenClaw Cloudflare template); not Cloudflare documentation |
| Terraform provider v5 covers Tunnel, Tunnel config, Access application, Access policy and identity providers (`onetimepin`); a Containers application resource is **not confirmed**, so the container is deployed with Wrangler | provider changelog v5.7.0; community thread |
| New Zero Trust organisations default to Cloudflare's own identity provider, so one-time PIN must be enabled explicitly | /cloudflare-one/integrations/identity-providers/one-time-pin/ |

**Gate results.**

| Option | G1 | G2 | G3 | G4 | G5 | G6 | G7 | Outcome |
|---|---|---|---|---|---|---|---|---|
| A — Tunnel + VM | pass | pass (VM volume + backups) | pass (15 s heartbeat ≪ 125 s / 900 s) | pass | pass | pass | **fail** (VM is outside Cloudflare) | survives only if G7 is waived |
| B — Containers as is | conditional | **fail** (ephemeral disk; snapshots manual, beta, loss window unknown) | unverified | pass | pass | pass | pass | **eliminated at G2** |
| B+ — Containers + Litestream/R2 + FUSE | conditional on keep-alive | conditional on three unknowns below | unverified | pass | pass | pass | pass | **survives, needs the PoC** |
| C — Workers rewrite | pass | pass (D1/R2/DO) | pass | **fail**: no subprocess, so no ffmpeg and no `node:sqlite` in Workers; assembly would still need a container | pass | pass | pass | **eliminated at G4** (and the largest code change by far) |
| D — Kubernetes | pass | pass (PVC) | pass | pass | pass | pass | **fail** | dominated by A: same G7 failure, more to operate |

**Unknowns that decide B+ (each becomes a PoC experiment):**
1. Does the instance keep progressing a session with **no incoming request** for longer than `sleepAfter`, using a Durable-Object-side keep-alive? (Experiment 7.11.)
2. Is **media durable at file close** on the FUSE mount, and does the real assembly adapter (which finalises an MP4) write correctly to it? (Experiments 7.4, 7.6.)
3. Is the **database recovery window** after a hard stop small enough to accept, and does the app tolerate losing the last seconds of writes (e.g., re-sending one provider request; `PRIMARY KEY` idempotency already protects `scene_results`)? (Experiment 7.4.)

**Scoring of the survivors** (evaluator scores 0–10 before any PoC; B+ durability is scored on documented expectations and must be revised after the PoC):

| Criterion (weight) | A | B+ | Reasoning |
|---|---|---|---|
| Data durability and backup (30%) | 8 | 6 | A: real volume + backups, loss window = backup interval. B+: three moving parts (Litestream, FUSE, R2), unproven |
| Application code change (25%) | 9 | 6 | Both need the follow-up fixes of Decision 10. B+ also needs a Worker, a Durable Object class and a keep-alive |
| Deploy, rollback, same-artifact (25%) | 7 | 8 | B+: Wrangler rollouts replace the instance with a new image reference; A: image pull + restart over SSH or an agent |
| Operational load (20%) | 5 | 7 | A: OS patching, disk, Docker, host monitoring. B+: managed, but beta features |
| **Weighted total** | **7.40** | **6.70** | |

**Selection (task 3.5).** Cost is not scored. A scores higher on the technical criteria, but it fails G7, the ticket's own wording ("deploy the application in dash.cloudflare.com"). **Leading option: B+**, because it is the only option that passes every gate including G7, conditional on the three unknowns above. **Documented fallback: A**, which is technically stronger but needs the product owner to waive G7. If B+ fails a gate in the PoC (task 7.10), the choice becomes "waive G7 and take A" or "accept C's rewrite with a container for assembly"; that is a product-owner decision and is recorded as such, not made silently.

**Cost, for information only** (rates retrieved 2026-10-12; always-on `standard-2` instance, 1 vCPU / 6 GiB / 12 GB): memory ≈ 6 GiB × 2.63 M s × $0.0000025 ≈ $39/month, disk ≈ $2/month, CPU on active use only, plus the shared $5 Workers Paid minimum and R2 storage. Roughly $40–45 per environment per month if the instance never sleeps; less when it does. Option A's VM price was not researched (provider-dependent). The domain renewal price was not researched.

**Selection update (2026-10-12, product owner): option A.** G7 is waived: Cloudflare is the edge (DNS, TLS, Tunnel, Access) and the compute is a VM. The leading-option text above is kept as the record of what was known when it was written. B+ is the runner-up. Consequences: groups 4–6 of the tasks are redone for A (§4 and §5 below carry the A versions), the B+-specific PoC files are retained under `poc/` as reference, and unknowns 1–3 above are no longer decision inputs.

### §4 — Frontend placement (tasks 4.1–4.3)

| | F1 Pages + separate API host | F2 backend serves the build | F3 Worker static assets + `/api` proxy |
|---|---|---|---|
| Same artifact in UAT and production | no, build bakes `VITE_API_BASE` per environment | yes (relative base) | yes (relative base `/api`) |
| CORS needed | yes, plus Access across two origins | no | no |
| SSE and downloads carry the Access cookie | needs cross-origin credentials | same origin | same origin |
| Product code change | CORS restriction | a static-file route in the backend | none (Worker strips `/api`) |
| Available with | any option | A, B, B+ | B, B+ (needs a Worker in front) |

**Selection.** With B+ as the leading option, **F3**: one Worker per environment serves the static build and forwards `/api/*` to the container with the prefix stripped, so the backend keeps its current routes and no product code serves files. Under A the equivalent is F2. F1 is the fallback only if neither is possible. The frontend's `VITE_API_BASE` becomes `/api`, which is the follow-up story "frontend API base". Task 4.2's question is answered by F3: a Worker in front of the backend routes `/api/*` on the same hostname, so Pages is not needed for the API at all.

**Consequence for follow-up stories (B+ reading, superseded):** static assets move into the Worker's deployment; the CORS and SSE-origin fixes of Decision 10 remain worth doing as defence in depth even with a same-origin layout.

**Selection update (option A): F4.** A Caddy reverse proxy in the same network namespace as the backend serves the static build and forwards `/api/*` (prefix stripped) to `127.0.0.1:3100`, so the backend keeps its routes and no product code serves files; the Tunnel's only target is Caddy. The frontend's `VITE_API_BASE` becomes `/api` (same follow-up story as before). F2 (a static-file route in the backend, one process fewer) remains a valid simplification if a follow-up story prefers a product-code change to a sidecar. F1 stays the last resort.

### §5 — Delivery model (tasks 5.1–5.6, option A)

The first version of this section described B+ (Worker, Litestream, R2 FUSE). It was replaced when the product owner chose option A; the B+ files under `poc/` stay as reference only.

**5.0 Topology per environment** (one VM each; UAT and production never share a host, a volume or a Tunnel):

```
browser ──HTTPS──▶ Cloudflare edge (DNS, TLS, Access gate)
                         │  (Tunnel, outbound from the VM; no inbound port)
                         ▼
VM (Docker, one compose project)
   ┌── network namespace shared by three containers ───────────────┐
   │ cloudflared ──▶ caddy :8080 ─ /      static build            │
   │                         └ /api/*  (prefix stripped) ▶ backend │
   │                                           127.0.0.1:3100      │
   └───────────────────────────────────────────────────────────────┘
   volume /var/lib/vid4you  (DB_PATH, PROJECTS_ROOT)   ──▶ backup job ──▶ R2 bucket
```

`cloudflared` and Caddy join the backend's network namespace (`network_mode: "service:backend"`), so the loopback-only listen address of finding 2 needs neither a `HOST` change nor a `socat` shim. The host publishes no ports.

**5.1 Branch flow.** Feature branches → `feature/entrega-2-JAME` (UAT) → `main` (production). The mapping lives in one workflow-level map, for example `env: { UAT_BRANCH: feature/entrega-2-JAME, PROD_BRANCH: main }`, read by every job. Promotion rule and fail-closed check as in Decision 7. A promotion image is identified by `git rev-parse <commit>^{tree}`.

**5.2 CI jobs.**

| Job | Trigger | Does |
|---|---|---|
| `check` | every pull request | install ffmpeg, then `typecheck` and `test` for backend and frontend, with temporary `DB_PATH`/`PROJECTS_ROOT` and no `.secrets.json` |
| `build` | push to the UAT branch | build the image once (backend + built frontend, Caddy config), tag with commit SHA and tree hash, push to GHCR |
| `deploy-uat` | after `build` | Terraform plan/apply for UAT (Tunnel, DNS, Access, bucket, VM), then on the VM: pull the image by digest, stop the backend, start it (stop-then-start), smoke check through an Access service token |
| `deploy-prod` | push to `main` | compute `main`'s tree hash, look up the UAT-recorded image; **fail if none**; wait for the `production` environment's reviewer; pull **that digest** on the production VM, stop-then-start, smoke check |

How CI reaches the VM: SSH, with port 22 also closed to the internet and reached through the Tunnel (`cloudflared access ssh`, authenticated by an Access service token); the deploy user may only run the compose commands. Marked VERIFY for the follow-up story; the alternative is a pull-based agent on the VM.

**5.3 Secret inventory** (per environment; values never in the repository, the image or logs):

| Secret | Used by | Stored in |
|---|---|---|
| `OPENAI_KEY`, `ELEVENLABS_KEY`, `FAL_API_KEY`, `RUNNINGHUB_API_KEY` | backend | root-only env file on the VM, written by the deploy job from the GitHub Environment secret |
| Tunnel token | `cloudflared` | same env file |
| R2 access key pair for `<env>-backup` | backup job | same env file |
| `CLOUDFLARE_API_TOKEN` (scoped), VM provider token | Terraform in CI | GitHub Environment secret |
| Terraform state backend key pair | CI | GitHub Environment secret |
| Access service token (id + secret) | smoke checks, CI's SSH and the uptime probe | GitHub Environment secret |

Separate UAT provider keys: OpenAI supports per-project keys. For ElevenLabs, fal and RunningHub, whether a second key can be created and attributed separately must be checked in each provider's console; recorded as an open item for the follow-up story rather than assumed.

**5.4 Terraform layout.**

```
infra/
  modules/edge     # Tunnel, tunnel ingress, DNS record, Access: one-time-PIN IdP, application, policies
  modules/host     # the VM, its firewall (deny all inbound), volume
  modules/backup   # R2 bucket <env>-backup and a scoped access key
  uat/    main.tf  # one state per environment
  prod/   main.tf
```

Provider: Cloudflare v5, pinned, plus the Hetzner Cloud provider (`hcloud`). State backend: an R2 bucket through the S3-compatible backend, created once by hand (the bootstrap problem; recorded). The zone is **imported**, not created. Everything, including the application runtime (compose project), is declared; there is no Wrangler step. Secret values are supplied as variables at apply time. `modules/edge` is sketched under `poc/terraform/`; it validated and applied against provider v5 on 2026-10-12 (7 resources); `modules/host` and `modules/backup` are not yet written.

**5.5 Backups.**

| Data | Primary | Backup | Recovery point |
|---|---|---|---|
| SQLite store | `DB_PATH` on the VM volume | scheduled `sqlite3 .backup` (online backup API, never a copy of the live `-wal` file), then `restic` to `<env>-backup` | the backup interval (proposed 15 min) |
| Project files | `PROJECTS_ROOT` on the VM volume | `restic` incremental to `<env>-backup`, same job | the backup interval (proposed 1 h) |
| Whole host | VM volume | provider snapshot as a second, coarse layer | daily |

restic gives encrypted, deduplicated, incremental backups to R2's S3 API with one tool for both data kinds. The restore drill (task 6.6) restores both into an empty volume and records duration. The recovery-point bound is a number the ADR records, not a promise.

**5.6 Health, logs, alerting.** Health: the existing `GET /health`, called by an external uptime check that carries an Access service token (Access would otherwise reject an anonymous probe). Logs: Fastify JSON to stdout, kept by Docker's `local` log driver with rotation on the VM and searchable there; retention is recorded. Alert: an email from the uptime check on failure, and one when the last successful backup is older than twice its interval. Anything beyond that is deferred.

**5.7 Cost, for information only** (not researched in detail): a small VM (Hetzner CX-class) per environment is single-digit euros per month; Cloudflare Tunnel, Access (free up to 50 users) and DNS are free; R2 storage is cents for this volume; the domain renewal is the registrar's. All of it is well below the $40–45 per environment per month of B+.
