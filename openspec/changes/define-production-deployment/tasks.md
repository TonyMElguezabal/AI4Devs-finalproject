# Tasks — Define the production and UAT deployment

Timebox: 3 working days. The decision is recorded at the end of the timebox even if evidence is thin; anything unproven is written down as a risk rather than reported as passing.

The backend stack, the store, the live-update mechanism and the single-process orchestration are inputs here, not decisions re-opened. No product code changes in this change (design Decision 10); proof-of-concept files live under `poc/` (Decision 12). Reports go under `openspec/changes/define-production-deployment/reports/`, following the precedent of earlier spikes.

## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create feature branch `feature/jos-194-production-deployment` from `origin/feature/entrega-2-JAME` (MVP branches come from and merge into the integration branch, not `main`) — created in worktree `../AI4Devs-jos-194`
- [x] 0.2 Verify branch creation and current branch status — verified; upstream unset so a push cannot land on `feature/entrega-2-JAME` by accident

## 1. Gate: Collect the inputs and the product owner's answers

- [ ] 1.1 Ask the product owner the design's open questions 1–5 and record the answers in `design.md` § Execution Record §1 — partial (2026-10-12): environments, allowlist and UAT providers answered; domain/hostnames (2) and hosting budget (5) still open
- [ ] 1.2 Re-verify against the current code every constraint listed in `design.md` § Context (env vars, credentials, ffmpeg paths, SSE route, `/health`, CORS, body limit) and record any drift
- [ ] 1.3 Confirm whether the stubbed voice and video providers produce media the real ffmpeg assembly can decode, so the proof of concept knows whether assembly is exercised for real or must be recorded as a stand-in
- [ ] 1.4 Record what is still undecided at this point, so later conclusions can be traced to what was known

## 2. Product: Draft the access change

- [ ] 2.1 Draft the PRD text for §2.3, §12.3 and D07 that permits a hosted single-user install behind an edge access gate (design Decision 4), as a proposed change with a changelog row
- [ ] 2.2 Submit the draft to the product owner and record the outcome; if not approved by the end of the timebox, mark every production-publishing follow-up story as blocked on it

## 3. Evaluate the backend options

- [ ] 3.1 Check options A–D against gates G1–G6 (design Decision 1), citing current Cloudflare and provider documentation with its retrieval date; eliminate any option failing a gate and record which gate and why
- [ ] 3.2 For option B, establish from current documentation whether container disk survives restarts and deploys, whether an instance can be kept running through a long session, and whether SSE responses stream; record each as a fact with its source
- [ ] 3.3 Score the survivors against the weighted criteria (durability and backup 25%, code change 20%, deploy/rollback/same artifact 20%, operational load 20%, cost 15%)
- [ ] 3.4 Estimate monthly cost per environment for each survivor, listing every billable component
- [ ] 3.5 Select the leading option and record the runner-up as the documented fallback

## 4. Evaluate the frontend placement

- [ ] 4.1 Compare F1 (Pages + separate API hostname) and F2 (backend serves the built frontend, API under `/api` on the same origin) on: same-artifact promotion, CORS, Access across origins, SSE cookie behaviour, moving parts (design Decision 3)
- [ ] 4.2 Check whether F1 can route `/api/*` on the Pages hostname to the backend, and what that adds
- [ ] 4.3 Select the placement and record what each follow-up story must change as a result (API base, static route or CORS)

## 5. Define the environment and delivery model

- [ ] 5.1 Write down the branch flow (feature branches → `feature/entrega-2-JAME` = UAT → `main` = production), where the branch-to-environment mapping is declared once, and the promotion-by-source-tree rule with its fail-closed check (design Decision 7)
- [ ] 5.2 Define the CI jobs: PR checks with temporary `DB_PATH`/`PROJECTS_ROOT` and no `.secrets.json`, build-once-per-tree, UAT deploy on push to the UAT branch, approval-gated production deploy on push to `main` (design Decision 8)
- [ ] 5.3 Define the secret inventory per environment (provider keys, deploy credentials, Tunnel token, Terraform credentials) and where each one lives; record per provider whether UAT can have its own key so UAT spend stays separate
- [ ] 5.4 Define the Terraform layout: resources per environment, provider(s), remote state location, how secret values are passed (design Decision 9)
- [ ] 5.5 Define backup schedule, method (SQLite online backup + incremental project-file sync), target bucket, and the recovery-point bound it implies (design Decision 6)
- [ ] 5.6 Define the health check, log retention and uptime alert (design Decision 11)

## 6. Build the proof of concept (throwaway, under `poc/`)

- [ ] 6.1 Write `poc/Dockerfile`: pinned Node version matching the project, ffmpeg/ffprobe from the distribution linked to the paths the code expects, frontend build included if F2 was chosen; record every workaround as a stand-in
- [ ] 6.2 Build and run the image locally with a mounted volume for `DB_PATH`/`PROJECTS_ROOT` and `USE_STUB_*` enabled; confirm `/health` answers
- [ ] 6.3 Write the Terraform sketch under `poc/terraform/` for the chosen option on a temporary hostname, including the Access application and the real allowlist policy (product owner's address, one-time PIN)
- [ ] 6.4 Apply it and deploy the image; list every created resource in `poc/RESOURCES.md` with its cost
- [ ] 6.5 Write the workflow sketch under `poc/workflows/` (not under `.github/workflows/`, so nothing runs on the shared repository yet)
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

- [ ] 13.1 Write the follow-up stories with acceptance criteria, each naming the `deployment-foundation` requirement it satisfies: configurable ffmpeg/ffprobe + production Dockerfile; frontend API base / static serving; production start guards; Terraform UAT; CI + UAT deploy; backup and restore; Terraform production + gated promotion; health and alerting
- [ ] 13.2 Tear down every resource in `poc/RESOURCES.md` not explicitly adopted by a follow-up story, and record the teardown
- [ ] 13.3 Comment on JOS-194 with the decision, the ADR link and the follow-up story list
