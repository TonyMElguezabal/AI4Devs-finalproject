## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create feature branch `feature/jos-200-video-request-status` from `main` (no upstream)
- [x] 0.2 Verify the current branch

## 1. Backend tests first (TDD)

- [x] 1.1 Test the migration: `scenes.video_request_sent_at` and `video_request` exist and are null for existing scenes
- [x] 1.2 Test that submitting a clip stores the send time and the allow-listed body (`prompt`, `duration`, `resolution`, `firstFrame`), drops any other field returned by the adapter, and that a retry overwrites both
- [x] 1.3 Test the scene representation: `videoRequest` present only while `video-generating`, with provider, attempt, `sentAt` and body; absent when complete or failed; the same after a simulated restart (read from the store)
- [x] 1.4 Test the estimate: same provider and duration with at least 3 successes; fallback to any duration; `null` with none; failures and other providers ignored
- [x] 1.5 Test the clip diagnostic counts the in-flight request (attempt 1 in flight shows 1; after it ends and a retry is in flight shows 2) and that `provider_requests` rows and the usage report are unchanged
- [x] 1.6 Extend the `stage-diagnostics` sentinel test: a stored request with a provider URL and an extra sentinel field; neither appears in the read or the snapshot

## 2. Backend implementation

- [x] 2.1 Add the migration (next version) and the two fields to the scene row mapping
- [x] 2.2 Add `sentBody` to the `submitted` result in the RunningHub and stub adapters
- [x] 2.3 Store the allow-listed body and send time in `markVideoGenerating`
- [x] 2.4 Add `videoRequest` (strict schema) and the estimate query to the scene representation; count the in-flight request in `sceneStageDiagnostics`

## 3. Frontend tests first, then implementation

- [x] 3.1 Test `SceneRow`: the clip request block while generating (provider, attempt, sent at, live elapsed, expected arrival and basis, "no estimate yet", "taking longer than estimated"); the collapsed request view and its JSON; no block when complete; the accessible name
- [x] 3.2 Implement the block, the 1 s clock while visible, and the collapsible JSON view

## 4. Review and Update Existing Unit Tests (MANDATORY)

- [x] 4.1 Review video stage, scene representation, stage diagnostics and adapter contract tests for assumptions the new field, the adapter result and the in-flight count change; update them

## 5. Run Unit Tests and Verify Database State (MANDATORY)

- [ ] 5.1 Capture the pre-test database baseline (isolated `DB_PATH` and `PROJECTS_ROOT`)
- [ ] 5.2 Run targeted tests
- [ ] 5.3 Run `npm run typecheck`, `npm run lint` and `npm test` in `backend` and `frontend`
- [ ] 5.4 Verify post-test database state and restore if needed
- [ ] 5.5 Create report `reports/YYYY-MM-DD-step-5-unit-test-and-db-verification.md`
- [ ] 5.6 Mark the step complete only after tests pass and the report exists

## 6. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 6.1 Start the backend with stub providers and a slow stub video latency in an isolated data folder; create a session; curl `GET /runs/:id` while a clip generates and confirm `videoRequest` and the clip diagnostic; restart the backend and confirm the same `sentAt` and body
- [x] 6.2 Restore the data folder and document commands and responses in `reports/YYYY-MM-DD-step-6-curl-endpoint-testing.md`

## 7. E2E Testing with Playwright MCP (MANDATORY - AGENT MUST EXECUTE)

- [x] 7.1 With stub providers, expand a generating scene: check the block, the elapsed time increasing, the estimate text, the request view; check the block disappears when the clip completes
- [x] 7.2 Record the run and screenshots in `reports/YYYY-MM-DD-step-7-e2e.md`

## 8. Update Technical Documentation (MANDATORY)

- [ ] 8.1 Update `docs/data-model.md` (two scene columns) and `docs/api-spec.yml` (`videoRequest`)
- [ ] 8.2 Update the PRD (new version, previous kept): §3 scene details show the clip request status, estimate and request body
- [ ] 8.3 Update `docs/backend-standards.md` (stage diagnostics section): the `videoRequest` allow-list and its sentinel
- [ ] 8.4 Run `graphify update .`
- [ ] 8.5 Open the pull request linking JOS-200; archive the change after merge
