# Tasks — Define the production and UAT deployment

Timebox: 3 working days. The decision is recorded at the end of the timebox even if evidence is thin; anything unproven is written down as a risk rather than reported as passing.

The backend stack, the store, the live-update mechanism and the single-process orchestration are inputs here, not decisions re-opened. No product code changes in this change (design Decision 10); proof-of-concept files live under `poc/` (Decision 12). Reports go under `openspec/changes/define-production-deployment/reports/`, following the precedent of earlier spikes.

## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create feature branch `feature/jos-194-production-deployment` from `origin/feature/entrega-2-JAME` (MVP branches come from and merge into the integration branch, not `main`) — created in worktree `../AI4Devs-jos-194`
- [x] 0.2 Verify branch creation and current branch status — verified; upstream unset so a push cannot land on `feature/entrega-2-JAME` by accident

## 1. Gate: Collect the inputs and the product owner's answers

- [x] 1.1 Ask the product owner the design's open questions 1–5 and record the answers in `design.md` § Execution Record §1 — done (2026-10-12): all five answered; only the domain name itself remains, tracked in 1.5
- [x] 1.2 Re-verify against the current code every constraint listed in `design.md` § Context (env vars, credentials, ffmpeg paths, SSE route, `/health`, CORS, body limit) and record any drift — done: constraints hold; four new findings (assembly tool never wired, loopback-only listen, truthy test flags, SSE echoes Origin) recorded in `design.md` § Execution Record §1.2
- [x] 1.3 Confirm whether the stubbed voice and video providers produce media the real ffmpeg assembly can decode, so the proof of concept knows whether assembly is exercised for real or must be recorded as a stand-in — done: **no** (stub video is a 12-byte `ftyp` header, stub assembly writes no file); recorded in § Execution Record §1.3
- [x] 1.4 Record what is still undecided at this point, so later conclusions can be traced to what was known — done: § Execution Record §1.4
- [x] 1.5 Get the domain name from the product owner, have them register it through Cloudflare Registrar (a manual purchase they approve; never bought by the agent), and record the zone and hostnames (design Decision 9b) — done: `vid4you.download` registered 2026-10-12 via Cloudflare; production = apex, UAT = `uat.vid4you.download`, PoC = `poc.vid4you.download`

## 2. Product: Draft the access change

- [x] 2.1 Draft the PRD text for §2.3, §12.3 and D07 that permits a hosted single-user install behind an edge access gate (design Decision 4), as a proposed change with a changelog row — done: `prd-draft.md` (also covers §12.2 and the §2.1/§11 credentials wording; `docs/PRD.md` untouched)
- [x] 2.2 Submit the draft to the product owner and record the outcome; if not approved by the end of the timebox, mark every production-publishing follow-up story as blocked on it — done: approved as drafted on 2026-10-12; production-publishing stories are not blocked on it; the three open questions keep the draft's defaults
- [ ] 2.3 Apply the approved text to `docs/PRD.md` as v1.6 (§2.3, §12.3, §12.2, §2.1/§11, D07, §16 changelog), following the repository's convention of keeping the previous version as a copy (`docs/PRD-v1.5.md`), and check which tests and documents read `docs/PRD-v1.4.md` or the PRD version before moving anything

## 3. Evaluate the backend options

- [x] 3.1 Check options A–D against gates G1–G6 (design Decision 1), citing current Cloudflare and provider documentation with its retrieval date; eliminate any option failing a gate and record which gate and why — done: five options against seven gates (G7 added from the ticket wording); B eliminated at G2, C at G4, D dominated by A; table in `design.md` § Execution Record §3
- [x] 3.2 For option B, establish from current documentation whether container disk survives restarts and deploys, whether an instance can be kept running through a long session, and whether SSE responses stream; record each as a fact with its source — done: disk ephemeral, snapshots manual/beta, no pinning, SIGTERM + 15 min, SSE not documented; sources in § Execution Record §3
- [x] 3.3 Score the survivors against the weighted criteria (durability and backup 30%, code change 25%, deploy/rollback/same artifact 25%, operational load 20%; cost is not scored per product-owner decision) — done: A 7.40, B+ 6.70 (evaluator scores, B+ durability to be revised after the PoC)
- [x] 3.4 Estimate monthly cost per environment for each survivor, listing every billable component, for information only — done: ≈$40–45 per environment per month if never sleeping (Containers); VM and domain renewal not researched
- [x] 3.5 Select the leading option and record the runner-up as the documented fallback — done: leading B+ (only option passing every gate incl. G7, conditional on three unknowns); fallback A (needs G7 waived by the product owner)
- [x] 3.6 Record the product owner's decision on the G7 waiver and the resulting selection — done (2026-10-12): option A chosen, G7 waived; B+ is the runner-up; recorded in `design.md` Decision 1, Decision 2 and § Execution Record §3 "Selection update"

## 4. Evaluate the frontend placement

- [x] 4.1 Compare F1 (Pages + separate API hostname) and F2 (backend serves the built frontend, API under `/api` on the same origin) on: same-artifact promotion, CORS, Access across origins, SSE cookie behaviour, moving parts (design Decision 3) — done: F1/F2/F3 compared in § Execution Record §4
- [x] 4.2 Check whether F1 can route `/api/*` on the Pages hostname to the backend, and what that adds — done: answered by F3 — a Worker in front of the backend routes `/api/*` on the same hostname, no Pages needed for the API
- [x] 4.3 Select the placement and record what each follow-up story must change as a result (API base, static route or CORS) — done: F4 under option A (Caddy sidecar serves the build and forwards `/api`; F3 was the B+ reading); `VITE_API_BASE` becomes `/api`; no product code serves files

## 5. Define the environment and delivery model

- [x] 5.1 Write down the branch flow (feature branches → `feature/entrega-2-JAME` = UAT → `main` = production), where the branch-to-environment mapping is declared once, and the promotion-by-source-tree rule with its fail-closed check (design Decision 7) — done: § Execution Record §5.1
- [x] 5.2 Define the CI jobs (reworked for option A, `design.md` §5.2): PR checks with temporary `DB_PATH`/`PROJECTS_ROOT` and no `.secrets.json`, build-once-per-tree, UAT deploy on push to the UAT branch, approval-gated production deploy on push to `main` (design Decision 8) — done: § Execution Record §5.2; promotion by existing image reference to be verified in the PoC
- [x] 5.3 Define the secret inventory per environment (provider keys, deploy credentials, Tunnel token, Terraform credentials) and where each one lives; record per provider whether UAT can have its own key so UAT spend stays separate — done: § Execution Record §5.3; separate UAT keys for ElevenLabs/fal/RunningHub to be checked in each console
- [x] 5.4 Define the Terraform layout (reworked for option A: edge, host and backup modules, no Wrangler, `design.md` §5.4): resources per environment, provider(s), remote state location, how secret values are passed (design Decision 9) — done: § Execution Record §5.4 (Terraform for surrounding resources, Wrangler for Worker + container)
- [x] 5.5 Define backup schedule (reworked for option A: `sqlite3 .backup` + restic to R2, `design.md` §5.5), method (SQLite online backup + incremental project-file sync), target bucket, and the recovery-point bound it implies (design Decision 6) — done: § Execution Record §5.5
- [x] 5.6 Define the health check, log retention and uptime alert (design Decision 11) — done: § Execution Record §5.6 (adds a stale-backup alert under A)
- [x] 5.7 Redo the delivery model for option A after the decision: host topology, deploy path, secrets, Terraform layout, backups — done: `design.md` § Execution Record §5.0–§5.7

## 6. Build the proof of concept (throwaway, under `poc/`)

The first version of this group built the B+ option (Worker, Litestream, R2 FUSE). Tasks 6.1–6.3 and 6.5 are kept as the done record; the files stay under `poc/` as reference for the runner-up. Tasks 6.7–6.9 redo the work for the chosen option A.

- [x] 6.1 (B+, reference only) Write `poc/Dockerfile`, `entrypoint.sh`, `litestream.yml` and `poc/preload.ts` — done; stand-ins: ffmpeg symlink, socat 8080→127.0.0.1:3100, preload registering assembly + stub providers; `POC_LOCAL=1` skips R2. The preload and the ffmpeg layers are reused by 6.7
- [x] 6.2 Build and run the image locally with a mounted volume for `DB_PATH`/`PROJECTS_ROOT` and `USE_STUB_*` enabled; confirm `/health` answers — done (local, `POC_LOCAL=1`, linux/arm64 under Colima): `/health` 200; one stubbed session reached `final-video` through real ffmpeg on Linux and downloaded as 1 s h264/mp3, 58 KB
- [x] 6.3 (B+, reference only) Worker, Durable Object keep-alive, `wrangler.jsonc`, and Terraform sketch with the Access application and owner/service-token policies — done as unvalidated sketches under `poc/worker/` and `poc/terraform/`; the Access resources are reused by 6.8
- [x] 6.5 Workflow sketch under `poc/workflows/` (not `.github/workflows/`) — done for B+; reworked by 6.9
- [x] 6.7 Build the option A image and compose project under `poc/`: the backend image without Litestream, FUSE or R2 (ffmpeg, preload, `DB_PATH` and `PROJECTS_ROOT` on one mounted volume), a Caddy config that serves the built frontend and forwards `/api/*` with the prefix stripped (SSE not buffered), and a compose file where `cloudflared` and Caddy share the backend's network namespace (`network_mode: "service:backend"`) and no port is published; run it locally and confirm the page, `/api/health` and one stubbed session reach `final-video` — done (local, linux/arm64 under Colima; `poc/Dockerfile.a`, `Dockerfile.web`, `Caddyfile`, `compose.yml`; `compose.local.yml` publishes Caddy on `127.0.0.1:18080` for local tests only, 8080 was taken by another process): page 200, `/api/health` `{"ok":true}`, stubbed session reached `final-video` and downloaded as 58,205 B `video/mp4` through Caddy; SSE unbuffered (connect immediate, heartbeat at 15 s); after `compose restart backend` the session and MP4 were still served from the named volume. Stand-ins: ffmpeg symlink, preload, `ALLOW_TEST_ENDPOINTS=1` + `quick-scene` (decomposition not wired). The `cloudflared` service is defined under profile `tunnel` and not yet run
- [ ] 6.8 Rewrite the Terraform sketch for option A under `poc/terraform/`: Tunnel and its ingress to Caddy, the DNS record for `poc.vid4you.download` on the imported zone, and the Access application and policies already sketched; validate it with `terraform validate`/`tofu validate` once a binary is available, and record anything that does not validate
- [x] 6.4 Apply the 6.8 Terraform (Access gate **before** the DNS record exists) and start the 6.7 compose project on the developer machine as the stand-in host; list every created resource in `poc/RESOURCES.md` with its cost — done (2026-10-12): 7 free-tier resources created by `tofu apply`, the Access gate before the DNS record; stack started on the developer machine with `cloudflared` in the shared namespace and no published port; inventory in `poc/RESOURCES.md`
- [ ] 6.6 Run the backup once (`sqlite3 .backup` and restic to a bucket; local directory or a second volume as a recorded stand-in if R2 is not enabled) and restore into an empty volume; record duration and what was recovered
- [ ] 6.9 Rewrite `poc/workflows/ci-cd.yml` for option A (build once by tree hash, deploy by digest over the Tunnel-reached SSH, fail-closed production job) and mark every point that needs a real VM as VERIFY

## 7. Run the experiments and record evidence

- [ ] 7.1 Access gate: confirm an unauthenticated request to the page and to the API is rejected at the edge, and an allowed identity gets through; confirm the host's own address on every published port is refused (no inbound port) — **partly done**: unauthenticated page and API both answer `302` to the Access login; service token gets `200` on both; no ports are published on the host (`docker compose ps`). Left: the allowed-identity browser login (task 11.1)
- [x] 7.2 End-to-end session: run one stubbed session through to the final-video download behind the gate — done through the real edge (`https://poc.vid4you.download/api`, service token): stubbed session reached `final-video`, downloaded 58,205 B `video/mp4`; stand-ins: preload stubs, `quick-scene`, ffmpeg symlink, developer machine as host
- [ ] 7.3 SSE through the edge: confirm live updates arrive without reload, then hold a quiet stretch longer than the edge's documented idle timeout and confirm the page is still current
- [ ] 7.4 Restart: restart the backend mid-session and confirm the session finishes with no data lost and the page recovers on its own — **partly done** (2026-10-12, through the real edge): backend restarted while the session sat at `voice-over-complete`; the session was intact, then reached `final-video` and downloaded (58,205 B); edge healthy again 7 s after the restart. **Not exercised: a restart while a stage is actually running** (stubbed stages finish in about a second). Finding: with `network_mode: service:backend`, `compose restart backend` also restarts `caddy` and `cloudflared`
- [ ] 7.5 Redeploy: deploy a new image mid-session using stop-then-start (`compose stop backend`, then `up -d`) and confirm no two backend processes ran at once and the session resumes
- [ ] 7.6 Real providers: run one short session with every `USE_STUB_*` off and credentials injected as secrets; confirm it reaches the final video through real ffmpeg on Linux and that no credential appears in logs or the image
- [ ] 7.7 Promotion check: simulate a merge into a scratch copy of `main` and confirm its tree hash finds the UAT-recorded image reference; then add an extra commit and confirm the lookup fails closed (against a local registry, since nothing is pushed to the shared repository)
- [ ] 7.8 Body limit: record which request-size limit (edge, Caddy or Fastify's 50 MB) a large script hits first
- [ ] 7.9 Record every outcome in `reports/YYYY-MM-DD-step-7-poc-experiments.md`, failures included, naming every observation that relied on a stand-in
- [ ] 7.10 If a must-pass gate fails, stop and move to the runner-up (B+) rather than continuing on paper; record which gate failed
- [ ] 7.11 Unattended progress: start a stubbed session, close every browser, wait longer than the edge's idle timeout, and confirm the session kept progressing and the page is current on reopening; record in the 7.9 report

## 8. Review and Update Existing Unit Tests (MANDATORY)

- [x] 8.1 Confirm which test suites exist (backend, frontend) and whether any test depends on a developer's `.secrets.json`, a fixed `DB_PATH` or a macOS ffmpeg path; record findings — done: 91 backend test files (1,443 tests; 3 contract files skip without keys) and 2 frontend files; dependencies on default `data/` paths, `ffprobe` on PATH, `docs/PRD-v1.4.md`, and a timing-sensitive `orchestrator.test.ts`; none needs `.secrets.json`
- [x] 8.2 Record every such dependency as input to the CI follow-up story (5.2); no product test is changed in this spike — done: recorded as findings 1-6 in `reports/2026-10-12-step-9-unit-test-and-db-verification.md`; no product test changed

## 9. Run Unit Tests and Verify Database State (MANDATORY)

- [x] 9.1 Capture the pre-test state of the local store (session and scene counts, `PROJECTS_ROOT` folder count) — done: worktree has no `backend/data` or `.secrets.json`; temp store dirs empty; main checkout dev DB mtime 2026-10-04 22:39
- [x] 9.2 Run the backend and frontend suites as CI would: fresh checkout, temporary `DB_PATH`/`PROJECTS_ROOT`, no `.secrets.json`; capture pass/fail/skip — done: backend 1439 passed / 4 skipped in 2 of 3 full runs (1 timing flake); frontend 162/162; both typecheck clean
- [x] 9.3 Run the same suites inside the proof-of-concept image (Linux) and record any difference from the macOS run — done: Linux aarch64 with ffmpeg and `docs/`: 1439 passed in one run, one orchestrator timing flake in the other; without ffmpeg 26 tests fail ("ffprobe is not installed")
- [x] 9.4 Verify post-test state matches the baseline, restoring it if needed — done: no state created in the worktree; dev DB mtime unchanged; nothing to restore
- [x] 9.5 Create `reports/YYYY-MM-DD-step-9-unit-test-and-db-verification.md` with commands, results, pre/post comparison and cleanup — done: `reports/2026-10-12-step-9-unit-test-and-db-verification.md`
- [x] 9.6 Mark this step complete only after the report exists — done: tests ran, flake and environment dependencies documented, report exists

## 10. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [ ] 10.1 Ensure the proof-of-concept environment is up and note the store's current state
- [ ] 10.2 `GET /health` without credentials and confirm the edge rejects it; repeat with an Access service token and confirm `200` — done: no credentials → `302` to the Access login on `/` and `/api/health`; service token → `200 {"ok":true}`
- [ ] 10.3 `POST` a session with a service token, confirm creation, then delete the session data to restore state
- [ ] 10.4 Hold the SSE stream open with `curl -N` through the edge and capture frames, including heartbeats across a quiet stretch
- [ ] 10.5 Download the final MP4 through the edge and confirm size and content type — done through the edge: `GET /sessions/:id/download/final-video` → `200`, 58,205 B, `video/mp4`
- [ ] 10.6 Error cases: unknown session id on `GET /events` returns `404`; a test-only endpoint does not answer with `ALLOW_TEST_ENDPOINTS` off
- [ ] 10.7 Record every command and response, confirm the store matches its pre-test state, and save `reports/YYYY-MM-DD-step-10-curl-endpoint-testing.md`

## 11. E2E Testing with Playwright MCP (MANDATORY - AGENT MUST EXECUTE)

- [ ] 11.1 Open the proof-of-concept hostname in the browser and pass the Access login with a test identity
- [ ] 11.2 Start a stubbed session from the UI and confirm live progress renders without reload
- [ ] 11.3 Restart the backend mid-session and confirm the page recovers on its own
- [ ] 11.4 Download the final video from the UI
- [ ] 11.5 Restore the environment and save `reports/YYYY-MM-DD-step-11-e2e-playwright.md`

## 12. Update Technical Documentation (MANDATORY)

- [x] 12.1 Write `docs/adr/0007-deployment.md`: gates, scored options, decision, rejected alternatives with reasons, cost per environment, evaluation date, risks — done: `docs/adr/0007-deployment.md` (Accepted 2026-10-12; VM provider Hetzner Cloud)
- [x] 12.2 Add a deployment section to `docs/backend-standards.md` (single instance, stop-then-start, storage, backups, configuration safety) — done: `## Deployment` section in `docs/backend-standards.md`
- [x] 12.3 Add a deployment section to `docs/frontend-standards.md` (placement, API base, same-origin or CORS) — done: `## Deployment` section in `docs/frontend-standards.md`
- [x] 12.4 Rewrite `docs/development_guide.md` around the real local setup and the `feature/entrega-2-JAME` (UAT) → `main` (production) flow, removing the stale setup of an unrelated earlier project — done: `docs/development_guide.md` rewritten (real local setup, credentials, state paths, dev-only switches, test preconditions, branch/environment flow); the stale setup of the unrelated earlier project, including its embedded database password, is gone. ADR 0007 is linked as "written when this change is accepted", not as an existing file
- [x] 12.5 Check the three documents name the same decision and do not contradict ADRs 0001–0006 — done: ADR 0007, the two standards sections and the development guide name the same decision (Tunnel + Access + one VM per environment, F4, restic to R2, promotion by tree hash); no contradiction found with ADRs 0001–0006 (single process, SQLite, SSE heartbeat unchanged). Note: `docs/adr/` has two files numbered 0005 (pre-existing)

## 13. Close the spike

- [x] 13.1 Write the follow-up stories with acceptance criteria, each naming the `deployment-foundation` requirement it satisfies: wire the real ffmpeg assembly tool at server bootstrap (blocker: no deployed environment can assemble without it); configurable ffmpeg/ffprobe paths + production Dockerfile; configurable listen `HOST`; frontend API base / static serving; CORS and SSE origin restriction; start guards that reject any `ALLOW_TEST_ENDPOINTS`/`USE_STUB_*` variable that is present; VM provider decision and host hardening (no inbound port, automatic updates); Caddy sidecar and compose project; Terraform UAT; CI + UAT deploy; backup and restore; Terraform production + gated promotion; health and alerting — done: `follow-up-stories.md` (S1–S13 with acceptance criteria and requirement mapping; not yet filed in Linear)
- [ ] 13.2 Tear down every resource in `poc/RESOURCES.md` not explicitly adopted by a follow-up story, and record the teardown
- [ ] 13.3 Comment on JOS-194 with the decision, the ADR link and the follow-up story list
