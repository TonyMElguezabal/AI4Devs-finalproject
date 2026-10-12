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
- [ ] 2.2 Submit the draft to the product owner and record the outcome; if not approved by the end of the timebox, mark every production-publishing follow-up story as blocked on it

## 3. Evaluate the backend options

- [x] 3.1 Check options A–D against gates G1–G6 (design Decision 1), citing current Cloudflare and provider documentation with its retrieval date; eliminate any option failing a gate and record which gate and why — done: five options against seven gates (G7 added from the ticket wording); B eliminated at G2, C at G4, D dominated by A; table in `design.md` § Execution Record §3
- [x] 3.2 For option B, establish from current documentation whether container disk survives restarts and deploys, whether an instance can be kept running through a long session, and whether SSE responses stream; record each as a fact with its source — done: disk ephemeral, snapshots manual/beta, no pinning, SIGTERM + 15 min, SSE not documented; sources in § Execution Record §3
- [x] 3.3 Score the survivors against the weighted criteria (durability and backup 30%, code change 25%, deploy/rollback/same artifact 25%, operational load 20%; cost is not scored per product-owner decision) — done: A 7.40, B+ 6.70 (evaluator scores, B+ durability to be revised after the PoC)
- [x] 3.4 Estimate monthly cost per environment for each survivor, listing every billable component, for information only — done: ≈$40–45 per environment per month if never sleeping (Containers); VM and domain renewal not researched
- [x] 3.5 Select the leading option and record the runner-up as the documented fallback — done: leading B+ (only option passing every gate incl. G7, conditional on three unknowns); fallback A (needs G7 waived by the product owner)

## 4. Evaluate the frontend placement

- [x] 4.1 Compare F1 (Pages + separate API hostname) and F2 (backend serves the built frontend, API under `/api` on the same origin) on: same-artifact promotion, CORS, Access across origins, SSE cookie behaviour, moving parts (design Decision 3) — done: F1/F2/F3 compared in § Execution Record §4
- [x] 4.2 Check whether F1 can route `/api/*` on the Pages hostname to the backend, and what that adds — done: answered by F3 — a Worker in front of the backend routes `/api/*` on the same hostname, no Pages needed for the API
- [x] 4.3 Select the placement and record what each follow-up story must change as a result (API base, static route or CORS) — done: F3 under B+ (F2 under A); `VITE_API_BASE` becomes `/api`; no product code serves files

## 5. Define the environment and delivery model

- [x] 5.1 Write down the branch flow (feature branches → `feature/entrega-2-JAME` = UAT → `main` = production), where the branch-to-environment mapping is declared once, and the promotion-by-source-tree rule with its fail-closed check (design Decision 7) — done: § Execution Record §5.1
- [x] 5.2 Define the CI jobs: PR checks with temporary `DB_PATH`/`PROJECTS_ROOT` and no `.secrets.json`, build-once-per-tree, UAT deploy on push to the UAT branch, approval-gated production deploy on push to `main` (design Decision 8) — done: § Execution Record §5.2; promotion by existing image reference to be verified in the PoC
- [x] 5.3 Define the secret inventory per environment (provider keys, deploy credentials, Tunnel token, Terraform credentials) and where each one lives; record per provider whether UAT can have its own key so UAT spend stays separate — done: § Execution Record §5.3; separate UAT keys for ElevenLabs/fal/RunningHub to be checked in each console
- [x] 5.4 Define the Terraform layout: resources per environment, provider(s), remote state location, how secret values are passed (design Decision 9) — done: § Execution Record §5.4 (Terraform for surrounding resources, Wrangler for Worker + container)
- [x] 5.5 Define backup schedule, method (SQLite online backup + incremental project-file sync), target bucket, and the recovery-point bound it implies (design Decision 6) — done: § Execution Record §5.5
- [x] 5.6 Define the health check, log retention and uptime alert (design Decision 11) — done: § Execution Record §5.6

## 6. Build the proof of concept (throwaway, under `poc/`)

- [x] 6.1 Write `poc/Dockerfile` for the leading option B+: pinned Node version matching the project, ffmpeg/ffprobe from the distribution linked to the paths the code expects, Litestream, FUSE and `tigrisfs`, and an entrypoint that restores the database from R2 before starting the server; the frontend is **not** in the image (F3 serves it from the Worker); record every workaround as a stand-in; add `poc/preload.ts`, loaded with `node --import`, that registers the real ffmpeg assembly adapter plus the stub decomposition, image, voice and video providers (video stub returning a small real MP4 generated by ffmpeg at image build), because the server wires none of these without a stub flag (design § Execution Record §1.2–1.3) — done: `poc/Dockerfile`, `entrypoint.sh`, `litestream.yml`, `preload.ts`; stand-ins: ffmpeg symlink, socat 8080→127.0.0.1:3100, preload registering assembly + stub providers; `POC_LOCAL=1` skips R2 for local runs
- [x] 6.2 Build and run the image locally with a mounted volume for `DB_PATH`/`PROJECTS_ROOT` and `USE_STUB_*` enabled; confirm `/health` answers — done (local, `POC_LOCAL=1`, linux/arm64 under Colima): `/health` 200 through the socat shim; one stubbed session reached `final-video` through real ffmpeg on Linux and downloaded as 1 s h264/mp3, 58 KB. R2 path (FUSE + Litestream) not yet exercised
- [x] 6.3 Write the Worker (static assets, `/api` proxy with prefix stripped, a `Container` subclass with a `schedule()`-based keep-alive that calls `renewActivityTimeout()`) under `poc/worker/`, and the Terraform sketch under `poc/terraform/` for the chosen option on the temporary hostname `poc.vid4you.download` from 1.5 (importing the existing zone, not creating it), including the Access application and the real allowlist policy (product owner's address, one-time PIN) — done as sketches: `poc/worker/` (Worker, Durable Object keep-alive, `wrangler.jsonc` with `workers_dev: false`) and `poc/terraform/main.tf` (OTP identity provider, owner and service-token policies, Access application, R2 bucket); **unvalidated**: no terraform/tofu binary installed, so attribute names against provider v5 are unchecked
- [ ] 6.4 Apply it and deploy the image; list every created resource in `poc/RESOURCES.md` with its cost
- [x] 6.5 Write the workflow sketch under `poc/workflows/` (not under `.github/workflows/`, so nothing runs on the shared repository yet) — done: `poc/workflows/ci-cd.yml` (sketch outside `.github/`); promotion-by-reference and `wrangler` image reference marked VERIFY
- [ ] 6.6 Run the backup once and restore into an empty volume; record duration and what was recovered

## 7. Run the experiments and record evidence

- [ ] 7.1 Access gate: confirm an unauthenticated request to the page and to the API is rejected at the edge, and an allowed identity gets through
- [ ] 7.2 End-to-end session: run one stubbed session through to the final-video download behind the gate
- [ ] 7.3 SSE through the edge: confirm live updates arrive without reload, then hold a quiet stretch longer than the edge's documented idle timeout and confirm the page is still current
- [ ] 7.4 Restart: restart the backend mid-session and confirm the session finishes with no data lost and the page recovers on its own
- [ ] 7.5 Redeploy: deploy a new image mid-session using stop-then-start and confirm no two backend processes ran at once and the session resumes
- [ ] 7.6 Real providers: run one short session with every `USE_STUB_*` off and credentials injected as secrets; confirm it reaches the final video through real ffmpeg on Linux and that no credential appears in logs or the image
- [ ] 7.7 Promotion check: simulate a merge into a scratch copy of `main` and confirm its tree hash finds the UAT-recorded image; then add an extra commit and confirm the lookup fails closed
- [ ] 7.8 Body limit: record which request-size limit (edge or Fastify's 50 MB) a large script hits first
- [ ] 7.9 Record every outcome in `reports/YYYY-MM-DD-step-7-poc-experiments.md`, failures included, naming every observation that relied on a stand-in
- [ ] 7.10 If a must-pass gate fails, stop and move to the runner-up option from 3.5 rather than continuing on paper
- [ ] 7.11 Unattended progress: start a stubbed session, close every browser, wait longer than `sleepAfter`, and confirm the session kept progressing (keep-alive works) and whether an open SSE stream alone counts as activity; record in the 7.9 report (design § Execution Record §3, unknown 1)

## 8. Review and Update Existing Unit Tests (MANDATORY)

- [ ] 8.1 Confirm which test suites exist (backend, frontend) and whether any test depends on a developer's `.secrets.json`, a fixed `DB_PATH` or a macOS ffmpeg path; record findings
- [ ] 8.2 Record every such dependency as input to the CI follow-up story (5.2); no product test is changed in this spike

## 9. Run Unit Tests and Verify Database State (MANDATORY)

- [ ] 9.1 Capture the pre-test state of the local store (session and scene counts, `PROJECTS_ROOT` folder count)
- [ ] 9.2 Run the backend and frontend suites as CI would: fresh checkout, temporary `DB_PATH`/`PROJECTS_ROOT`, no `.secrets.json`; capture pass/fail/skip
- [ ] 9.3 Run the same suites inside the proof-of-concept image (Linux) and record any difference from the macOS run
- [ ] 9.4 Verify post-test state matches the baseline, restoring it if needed
- [ ] 9.5 Create `reports/YYYY-MM-DD-step-9-unit-test-and-db-verification.md` with commands, results, pre/post comparison and cleanup
- [ ] 9.6 Mark this step complete only after the report exists

## 10. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [ ] 10.1 Ensure the proof-of-concept environment is up and note the store's current state
- [ ] 10.2 `GET /health` without credentials and confirm the edge rejects it; repeat with an Access service token and confirm `200`
- [ ] 10.3 `POST` a session with a service token, confirm creation, then delete the session data to restore state
- [ ] 10.4 Hold the SSE stream open with `curl -N` through the edge and capture frames, including heartbeats across a quiet stretch
- [ ] 10.5 Download the final MP4 through the edge and confirm size and content type
- [ ] 10.6 Error cases: unknown session id on `GET /events` returns `404`; a test-only endpoint does not answer with `ALLOW_TEST_ENDPOINTS` off
- [ ] 10.7 Record every command and response, confirm the store matches its pre-test state, and save `reports/YYYY-MM-DD-step-10-curl-endpoint-testing.md`

## 11. E2E Testing with Playwright MCP (MANDATORY - AGENT MUST EXECUTE)

- [ ] 11.1 Open the proof-of-concept hostname in the browser and pass the Access login with a test identity
- [ ] 11.2 Start a stubbed session from the UI and confirm live progress renders without reload
- [ ] 11.3 Restart the backend mid-session and confirm the page recovers on its own
- [ ] 11.4 Download the final video from the UI
- [ ] 11.5 Restore the environment and save `reports/YYYY-MM-DD-step-11-e2e-playwright.md`

## 12. Update Technical Documentation (MANDATORY)

- [ ] 12.1 Write `docs/adr/0007-deployment.md`: gates, scored options, decision, rejected alternatives with reasons, cost per environment, evaluation date, risks
- [ ] 12.2 Add a deployment section to `docs/backend-standards.md` (single instance, stop-then-start, storage, backups, configuration safety)
- [ ] 12.3 Add a deployment section to `docs/frontend-standards.md` (placement, API base, same-origin or CORS)
- [ ] 12.4 Rewrite `docs/development_guide.md` around the real local setup and the `feature/entrega-2-JAME` (UAT) → `main` (production) flow, removing the stale setup of an unrelated earlier project
- [ ] 12.5 Check the three documents name the same decision and do not contradict ADRs 0001–0006

## 13. Close the spike

- [ ] 13.1 Write the follow-up stories with acceptance criteria, each naming the `deployment-foundation` requirement it satisfies: wire the real ffmpeg assembly tool at server bootstrap (blocker: no deployed environment can assemble without it); configurable ffmpeg/ffprobe paths + production Dockerfile; configurable listen `HOST`; frontend API base / static serving; CORS and SSE origin restriction; start guards that reject any `ALLOW_TEST_ENDPOINTS`/`USE_STUB_*` variable that is present; Terraform UAT; CI + UAT deploy; backup and restore; Terraform production + gated promotion; health and alerting
- [ ] 13.2 Tear down every resource in `poc/RESOURCES.md` not explicitly adopted by a follow-up story, and record the teardown
- [ ] 13.3 Comment on JOS-194 with the decision, the ADR link and the follow-up story list
