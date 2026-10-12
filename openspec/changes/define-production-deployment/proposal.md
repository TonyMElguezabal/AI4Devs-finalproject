# Define the production and UAT deployment

Linear-Issue: JOS-194

## Why

Almost every MVP story is done, but Vid4You only runs on a developer's machine. The product owner wants a **production** environment on Cloudflare and a **UAT** environment that runs the same code from a dedicated `uat` branch, both delivered through CI/CD and provisioned as code. Nothing in the repository says how, and the codebase was built on assumptions that a hosted environment breaks:

- PRD §2.3, §12.3 and D07 define the MVP as a **local, single-user install with no authentication**, and state that exposing it outside a local environment *requires defining authentication and authorization first*. A public URL contradicts a closed product decision.
- The backend is one long-lived Node process that owns the orchestrator, the retry scheduler, the in-memory concurrency cap and the boot-time reconciliation, and it keeps its SQLite store and every media file on local disk (ADR 0002, PRD §12.2). That shape rules out serverless runtimes without a rewrite and demands durable storage plus backups wherever it lands.
- Assembly calls ffmpeg and ffprobe at hard-coded macOS paths (`backend/src/ffmpegAssemblyTool.ts`), so the final-video stage fails on any Linux host.
- The frontend fixes its API address at build time (`VITE_API_BASE`) and the backend accepts any CORS origin, which does not fit "same artifact in UAT and production".

Choosing a platform before these are understood risks picking one that cannot keep a session alive across a restart, or one that loses the user's videos on redeploy.

## What Changes

- Establish the must-pass gates any hosting option has to clear: a single long-lived backend instance, durable storage for `DB_PATH` and `PROJECTS_ROOT` that survives restarts and redeploys, long-lived SSE responses (ADR 0003), a Linux-capable ffmpeg, per-environment secrets, and an access gate in front of the app and API.
- Evaluate four options against those gates and weighted criteria: Cloudflare Pages + Cloudflare Tunnel to one container host with a persistent volume; Cloudflare Pages + Cloudflare Containers; a Workers-native rewrite (Hono, D1, R2, Durable Objects/Workflows); and Kubernetes. Rejected options are recorded with the gate or criterion they lost on.
- **Decide the access gate** that makes exposure acceptable without adding accounts to the MVP (leading candidate: Cloudflare Access with an email allowlist), and draft the PRD change to §2.3, §12.3 and D07 for product-owner approval. No production exposure happens before that approval.
- Decide the environment model: `uat` and `main` branches, where `uat` branches from given that MVP work merges into `feature/entrega-2-JAME`, and a promotion rule that ships to production the **same image digest** that passed UAT.
- Decide the CI/CD and infrastructure-as-code shape: GitHub Actions for typecheck, tests, image build and deploys; Terraform (Cloudflare provider) for DNS, Pages, Tunnel or Containers, Access and any R2 bucket; where Terraform state and secrets live.
- Decide the operational minimum: backup and restore of the SQLite store and project files, a health endpoint, log retention, and an uptime alert.
- Build a **throwaway proof of concept** of the chosen option on a temporary hostname behind the access gate, and run one stubbed session end to end, including SSE updates, MP4 download and a backend restart mid-session.
- Record the decision as ADR 0007, write the deployment and promotion flow into `docs/development_guide.md` (replacing its stale setup), and add a deployment section to `docs/backend-standards.md` and `docs/frontend-standards.md`.
- Produce the follow-up implementation stories this decision unblocks, each with acceptance criteria.
- No product behaviour ships, and no user-facing capability changes.

## Capabilities

### New Capabilities

- `deployment-foundation`: the guarantees this change establishes about how Vid4You is hosted — one documented hosting decision with its gates and evidence, an access gate approved before any exposure, durable and backed-up storage for sessions and media, a promotion rule that ships the artifact UAT validated, infrastructure declared as code, and recorded evidence that a session survives a backend restart on the chosen platform.

### Modified Capabilities

None. No existing spec in `openspec/specs/` states a requirement about where the application runs, who can reach it, CORS, or the assembly tool's location. The PRD access rule (§2.3, §12.3, D07) is product-level and is changed through the PRD draft this change produces, not through a delta spec.

## Impact

- **Product**: a drafted PRD update to §2.3, §12.3 and D07 that must be approved before production exposure. Until then, the PoC runs only behind the access gate on a temporary hostname.
- **Documentation**: new ADR 0007; deployment sections in `docs/backend-standards.md` and `docs/frontend-standards.md`; `docs/development_guide.md` rewritten around the real local setup and the UAT/production flow.
- **Repository**: a new long-lived `uat` branch. PoC files (Dockerfile, a Terraform sketch, a workflow sketch) live under this change's folder and are not wired into the product build.
- **Code touched only as far as the PoC needs**: the hard-coded ffmpeg/ffprobe paths and the build-time API address are the known blockers. Whether they are fixed here or in follow-up stories is decided in `design.md`.
- **External systems**: a Cloudflare account (Pages, Tunnel or Containers, Access, DNS, possibly R2) and GitHub Actions. The PoC uses stubbed providers (`USE_STUB_*`), so no provider credentials or provider spend are involved.
- **Cost**: a monthly estimate per environment is part of the decision. Any paid resource the PoC creates is listed so it can be torn down at the end of the timebox.
- **Risk carried forward**: the backend is single-instance by design. Hosting cannot add redundancy without reopening the orchestration decisions in `define-backend-stack` (JOS-179), and that is out of scope here.
