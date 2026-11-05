## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create feature branch `feature/jos-202-reference-image-generation` from `main` (no upstream)
- [x] 0.2 Verify the current branch

## 1. Spike: reference-capable image models (required before implementation, PRD §11)

- [x] 1.1 Take the 5-sentence Warry script and the style prompt from `openspec/changes/admin-visual-style-prompt/reports/2026-10-20-step-10-1-real-script.md` and prepare one reference image (PNG, under 5 MB)
- [x] 1.2 Generate the five scene images with `fal-ai/flux/dev` as the baseline
- [x] 1.3 Generate the same five with each candidate reference-capable Fal model (for example Flux Kontext, Flux Redux, an image-to-image variant), one request per image
- [x] 1.4 Record per candidate: character consistency (side by side), adherence to each scene's `IMAGE` instruction, latency, cost per image, output size and aspect ratio (16:9 must hold)
- [x] 1.5 Record how the reference is sent (data URI, upload or URL), its size and format limits, and the error behavior for an oversized, wrong-format and missing reference (HTTP status per case)
- [x] 1.6 Write the report in `reports/YYYY-MM-DD-step-1-reference-model-spike.md`, name the chosen model and request shape, or conclude that none qualifies (then stop and record the follow-up)
- [x] 1.7 Update `design.md` Decisions 2 and 5 and the specs with the chosen model, request fields and limits before any code (`CLAUDE.md` §7)

## 2. Backend: Tests first (TDD)

- [x] 2.1 Test `createRun` with a saved reference: the copy exists in the project folder, content type and SHA-256 are on the run; without one, the columns are null
- [x] 2.2 Test that replacing or removing the `/admin` image after creation leaves the run's snapshot unchanged
- [x] 2.3 Test the Fal adapter with a stub `fetch`: without a reference the body and URL equal today's; with one the body carries the reference in the spike's field and posts to the reference model
- [x] 2.4 Test that the adapter uses `IMAGE_REFERENCE_MODEL` when a reference is present and the profile's `model` otherwise, and that settings reject an invalid `imageReferenceModel`
- [x] 2.5 Test failure classification: 422 with a reference names the reference; 401 and 403 do not; 429 and 5xx stay transient; the response body never appears in the reason
- [x] 2.6 Test the orchestrator: every scene's image request carries the snapshot; a retry after the `/admin` image changed still carries the original; a restart-recovery launch carries it
- [x] 2.7 Test that a missing snapshot file fails only that scene as not retryable with the file named
- [x] 2.8 Test that the video request is unchanged for a session with a snapshot
- [x] 2.9 Test that the run row and the provider requests contain the hash and never the bytes or a data URI (the image stage writes no log line, so there is none to check)

## 3. Backend: Implementation

- [x] 3.1 Add the migration for `runs.reference_image_path`, `reference_image_content_type`, `reference_image_sha256` (number above `main`'s highest) and its test
- [x] 3.2 Copy the saved image in `createRun` and record the three columns; expose them on the run record
- [x] 3.3 Change the `ImageProvider` port to `generate(instruction, referenceImage?)` and update the stub adapters
- [x] 3.4 Implement the reference request in the Fal adapter and the `imageReferenceModel` setting (schema, `settings.default.json` with the value traced to the spike report, `IMAGE_REFERENCE_MODEL` export)
- [x] 3.5 Read the snapshot in `launchImageStage` and pass it to `generate`; fail the scene when the file is missing
- [x] 3.6 Implement the failure classification of Decision 5
- [x] 3.8 Raise `maxTimeSeconds.image` to 120 s (design Decision 7, option (a) chosen by the product owner): tests first (`providers-settings`, `settings` shipped defaults, `attempt-deadline`), then `settings.default.json`, the `providers.ts` comment and PRD §11.3 with its v1.19 change-log entry
- [x] 3.7 Not needed: the image stage writes no per-attempt log or attempt row, and the hash is on the run (design Decision 4), so nothing records the image beyond it

## 4. Frontend

- [x] 4.1 Update the notice in `VisualStyleSection.tsx` and its test to say the image is sent for sessions created afterwards

## 5. Review and Update Existing Unit Tests (MANDATORY)

- [x] 5.1 Review image-stage, image-provider, create-run, admin-settings and profile tests for assumptions the new port signature and columns change
- [x] 5.2 Update the affected tests and make group 2 pass

## 6. Run Unit Tests and Verify Database State (MANDATORY)

- [x] 6.1 Capture the pre-test database baseline (isolated `DB_PATH` and `PROJECTS_ROOT`)
- [x] 6.2 Run targeted tests for the changed modules
- [x] 6.3 Run `npm run typecheck`, `npm run lint` and `npm test` in `backend` and `frontend`
- [x] 6.4 Verify post-test database state and restore if needed
- [x] 6.5 Create report `reports/YYYY-MM-DD-step-6-unit-test-and-db-verification.md`
- [x] 6.6 Mark the step complete only after tests pass and the report exists

## 7. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

The Fal host is fixed in the adapter by design (no setting can name a host), so no local stand-in can receive the Fal request. What a stand-in would show (URL, body, reason text) is asserted by the adapter tests with a stubbed `fetch`; the curl step covers everything reachable over HTTP, with the voice stage held by `USE_STUB_VOICE_PROVIDER=hang` so no provider is billed.

- [x] 7.1 Start the backend on a throwaway `DB_PATH`, `PROJECTS_ROOT` and `PROVIDER_KEY_PATH`, with `ADMIN_PASSWORD` set and `USE_STUB_VOICE_PROVIDER=hang` (AGENT MUST EXECUTE)
- [x] 7.2 curl `PUT /admin/settings/reference-image`, then `POST /sessions`, and confirm the session's project folder holds `reference-image.<ext>` equal to the uploaded bytes and the run row holds its content type and SHA-256
- [x] 7.3 curl replace and then delete the `/admin` image and confirm the session's snapshot file and hash are unchanged
- [x] 7.4 curl `POST /sessions` with no `/admin` image and confirm the session has no snapshot file and null columns
- [x] 7.5 Confirm `GET /sessions/{id}` and the admin responses never contain the image bytes or a data URI
- [x] 7.6 Stop the server and delete the throwaway data; confirm `backend/data` is unchanged
- [x] 7.7 Document commands and responses in `reports/YYYY-MM-DD-step-7-curl-endpoint-testing.md`

## 8. E2E Testing with Playwright MCP (MANDATORY - AGENT MUST EXECUTE)

- [x] 8.1 With frontend and backend running, open `/admin`, upload a reference image and confirm the new notice
- [x] 8.2 Create a session from the interface and confirm it is created (the voice stage is held with `USE_STUB_VOICE_PROVIDER=hang`; the image request itself is covered by the adapter tests)
- [x] 8.3 Restore the environment and document the scenarios in `reports/YYYY-MM-DD-step-8-e2e-browser.md`

## 9. Real-provider check

- [x] 9.1 Call the real adapter once per scene with the Warry reference (the three scene instructions) through `createFalAiImageProvider` and record that the code path returns accepted 1920x1088 images with the same character; a full session is not run because its voice and video stages bill other providers

## 10. Update Technical Documentation (MANDATORY)

- [x] 10.1 Update `docs/data-model.md` (new `runs` columns) and `docs/api-spec.yml` if any response changes
- [x] 10.2 Update PRD §11 (image model with a reference) following the PRD versioning rules
- [x] 10.3 `readme.md` never states the reference image is not sent, so nothing to change (checked with a search)
- [x] 10.4 Run `graphify update .`
- [x] 10.5 Open the pull request linking JOS-202; archive the change after merge (PR merged; archived 2026-10-27)
