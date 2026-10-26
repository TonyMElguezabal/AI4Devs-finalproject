## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create feature branch `feature/jos-202-reference-image-generation` from `main` (no upstream)
- [x] 0.2 Verify the current branch

## 1. Spike: reference-capable image models (required before implementation, PRD §11)

- [ ] 1.1 Take the 5-sentence Warry script and the style prompt from `openspec/changes/admin-visual-style-prompt/reports/2026-10-20-step-10-1-real-script.md` and prepare one reference image (PNG, under 5 MB)
- [ ] 1.2 Generate the five scene images with `fal-ai/flux/dev` as the baseline
- [ ] 1.3 Generate the same five with each candidate reference-capable Fal model (for example Flux Kontext, Flux Redux, an image-to-image variant), one request per image
- [ ] 1.4 Record per candidate: character consistency (side by side), adherence to each scene's `IMAGE` instruction, latency, cost per image, output size and aspect ratio (16:9 must hold)
- [ ] 1.5 Record how the reference is sent (data URI, upload or URL), its size and format limits, and the error behavior for an oversized, wrong-format and missing reference (HTTP status per case)
- [ ] 1.6 Write the report in `reports/YYYY-MM-DD-step-1-reference-model-spike.md`, name the chosen model and request shape, or conclude that none qualifies (then stop and record the follow-up)
- [ ] 1.7 Update `design.md` Decisions 2 and 5 and the specs with the chosen model, request fields and limits before any code (`CLAUDE.md` §7)

## 2. Backend: Tests first (TDD)

- [ ] 2.1 Test `createRun` with a saved reference: the copy exists in the project folder, content type and SHA-256 are on the run; without one, the columns are null
- [ ] 2.2 Test that replacing or removing the `/admin` image after creation leaves the run's snapshot unchanged
- [ ] 2.3 Test the Fal adapter with a stub `fetch`: without a reference the body and URL equal today's; with one the body carries the reference in the spike's field and posts to the reference model
- [ ] 2.4 Test the adapter with a reference but no `referenceModel`: not retryable with the "does not support a reference image" reason
- [ ] 2.5 Test failure classification: 422 with a reference names the reference; 401 and 403 do not; 429 and 5xx stay transient; the response body never appears in the reason
- [ ] 2.6 Test the orchestrator: every scene's image request carries the snapshot; a retry after the `/admin` image changed still carries the original; a restart-recovery launch carries it
- [ ] 2.7 Test that a missing snapshot file fails only that scene as not retryable with the file named
- [ ] 2.8 Test that the video request is unchanged for a session with a snapshot
- [ ] 2.9 Test that logs and stored attempts contain the hash and never the bytes or a data URI

## 3. Backend: Implementation

- [ ] 3.1 Add the migration for `runs.reference_image_path`, `reference_image_content_type`, `reference_image_sha256` (number above `main`'s highest) and its test
- [ ] 3.2 Copy the saved image in `createRun` and record the three columns; expose them on the run record
- [ ] 3.3 Change the `ImageProvider` port to `generate(instruction, referenceImage?)` and update the stub adapters
- [ ] 3.4 Implement the reference request in the Fal adapter and the `referenceModel` parameter on the image profile and in `config/settings.default.json` with a value traced to the spike report
- [ ] 3.5 Read the snapshot in `launchImageStage` and pass it to `generate`; fail the scene when the file is missing
- [ ] 3.6 Implement the failure classification of Decision 5
- [ ] 3.7 Log the reference hash on the image attempt

## 4. Frontend

- [ ] 4.1 Update the notice in `VisualStyleSection.tsx` and its test to say the image is sent for sessions created afterwards

## 5. Review and Update Existing Unit Tests (MANDATORY)

- [ ] 5.1 Review image-stage, image-provider, create-run, admin-settings and profile tests for assumptions the new port signature and columns change
- [ ] 5.2 Update the affected tests and make group 2 pass

## 6. Run Unit Tests and Verify Database State (MANDATORY)

- [ ] 6.1 Capture the pre-test database baseline (isolated `DB_PATH` and `PROJECTS_ROOT`)
- [ ] 6.2 Run targeted tests for the changed modules
- [ ] 6.3 Run `npm run typecheck`, `npm run lint` and `npm test` in `backend` and `frontend`
- [ ] 6.4 Verify post-test database state and restore if needed
- [ ] 6.5 Create report `reports/YYYY-MM-DD-step-6-unit-test-and-db-verification.md`
- [ ] 6.6 Mark the step complete only after tests pass and the report exists

## 7. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [ ] 7.1 Start the backend with a stubbed Fal endpoint that records the request (AGENT MUST EXECUTE)
- [ ] 7.2 curl `PUT`/`POST` the `/admin/settings` reference image, create a session with `POST /sessions`, and confirm the stub received the reference on every image request
- [ ] 7.3 curl replace and delete the `/admin` image, retry one scene, and confirm the retry still carried the original
- [ ] 7.4 Make the stub answer 422 for one scene and confirm only that scene fails, not retryable, with the reference reason
- [ ] 7.5 Create a session with no reference and confirm the request body equals today's
- [ ] 7.6 Delete the test sessions and data; verify the database matches the baseline
- [ ] 7.7 Document commands and responses in `reports/YYYY-MM-DD-step-7-curl-endpoint-testing.md`

## 8. E2E Testing with Playwright MCP (MANDATORY - AGENT MUST EXECUTE)

- [ ] 8.1 With frontend and backend running, open `/admin`, upload a reference image and confirm the new notice
- [ ] 8.2 Create a session and confirm it proceeds through the image stage with the stubbed provider
- [ ] 8.3 Restore the environment and document the scenarios in `reports/YYYY-MM-DD-step-8-e2e-browser.md`

## 9. Real-provider check

- [ ] 9.1 Run the Warry script end to end once with the real chosen model and record character consistency in `reports/`

## 10. Update Technical Documentation (MANDATORY)

- [ ] 10.1 Update `docs/data-model.md` (new `runs` columns) and `docs/api-spec.yml` if any response changes
- [ ] 10.2 Update PRD §11 (image model with a reference) following the PRD versioning rules
- [ ] 10.3 Update `readme.md` where it states the reference image is not sent (Spanish)
- [ ] 10.4 Run `graphify update .`
- [ ] 10.5 Open the pull request linking JOS-202; archive the change after merge
