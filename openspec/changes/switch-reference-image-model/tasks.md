## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create feature branch `feature/jos-230-switch-reference-image-model` from `origin/main` (worktree `AI4Devs-jos-230`, no upstream)
- [x] 0.2 Verify the current branch

## 1. Evidence: model comparison report

- [x] 1.1 Write `reports/2026-10-26-model-comparison.md`: the six candidates, the eight scenes and why, the results table (text, character, latency, price, output size), the first-run flood of Fal's 20-concurrent limit, and the product owner's choice
- [x] 1.2 Copy the eight contact sheets (`Winrun_results/model-comparison/sheets/`) into `reports/model-comparison/` as small JPEGs and link them from the report

## 2. Backend: Tests first (TDD)

- [x] 2.1 In `backend/test/image-provider.test.ts`, change the expected `IMAGE_REFERENCE_MODEL` to `bytedance/seedream/v5/pro/edit`; add a test that a request with a reference posts to `https://fal.run/bytedance/seedream/v5/pro/edit` with `prompt`, `image_urls`, `image_size` and `output_format`
- [x] 2.2 In `backend/test/settings.test.ts`, change the shipped-defaults expectations to the new model and `image: 300`
- [x] 2.3 Run the two files and confirm they fail for the right reason

## 3. Backend: Implementation

- [x] 3.1 Set `imageReferenceModel` to `bytedance/seedream/v5/pro/edit` and `maxTimeSeconds.image` to `300` in `backend/config/settings.default.json`
- [x] 3.2 Update the comments in `backend/src/config/providers.ts` that cite the old model and the 120 s measurements (spike report, comparison report, observed 127 s average and 233 s maximum)
- [x] 3.3 Make group 2 pass

## 4. Frontend

- [x] 4.1 Search `frontend/` for the old model name or the old limit; nothing is expected to change (record the search) — searched `frontend/src` and `frontend/test` for `flux-2`, `imageReferenceModel`, `maxTimeSeconds`, `seedream` and an image limit of 120 or 25 s: 0 hits, no change

## 5. Review and Update Existing Unit Tests (MANDATORY)

- [x] 5.1 Search all tests for `flux-2`, `maxTimeSeconds` and an image limit of 120 or 25 and review each hit
- [x] 5.2 Update the affected tests and make group 2 pass — also `providers-settings.test.ts` (shipped image limit 300), `attempt-deadline.test.ts` (an image attempt's deadline is 5 min after it is sent) and, because `providerConfig.test.ts` compares the limits with the PRD §11.3 row, the number in that row (`Image 300s`); the PRD version bump and change-log row follow in 10.1

## 6. Run Unit Tests and Verify Database State (MANDATORY)

- [x] 6.1 Capture the pre-test database baseline (isolated `DB_PATH` and `PROJECTS_ROOT`)
- [x] 6.2 Run targeted tests for the changed modules
- [x] 6.3 Run `npm run typecheck`, `npm run lint` and `npm test` in `backend` and `frontend`
- [x] 6.4 Verify post-test database state and restore if needed
- [x] 6.5 Create report `reports/YYYY-MM-DD-step-6-unit-test-and-db-verification.md`
- [x] 6.6 Mark the step complete only after tests pass and the report exists

## 7. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

No endpoint changes. The settings are read at start-up and no route returns them, so this step checks that the server starts with the new defaults and the routes that depend on the image stage still answer.

- [x] 7.1 Start the backend on a throwaway `DB_PATH`, `PROJECTS_ROOT` and `PROVIDER_KEY_PATH`, with `ADMIN_PASSWORD` set and `USE_STUB_VOICE_PROVIDER=hang` (AGENT MUST EXECUTE)
- [x] 7.2 curl `GET /admin/provider-profiles` and confirm the image profile still names `fal-ai/flux/dev`
- [x] 7.3 curl `POST /sessions` and confirm a session is created and its image stage is not started (voice held)
- [x] 7.4 Stop the server and delete the throwaway data; confirm `backend/data` is unchanged
- [x] 7.5 Document commands and responses in `reports/YYYY-MM-DD-step-7-curl-endpoint-testing.md`

## 8. E2E Testing with Playwright MCP (not applicable)

- [x] 8.1 Record in `reports/YYYY-MM-DD-step-8-e2e-browser.md` that no frontend code or copy changed (group 4) and so no browser scenario applies

## 9. Real-provider check

- [x] 9.1 Call the real adapter once through `createFalAiImageProvider` with the Warry reference and the scene 26 instruction (one image, about $0.07); record the accepted 1920x1088 size, the latency and whether the text is legible, in `reports/YYYY-MM-DD-step-9-real-adapter-check.md`

## 10. Update Technical Documentation (MANDATORY)

- [x] 10.1 Update PRD §3, §11.3 and §11.5 and its change log (model, 300 s, reason) following the PRD versioning rules (previous version kept as `docs/PRD-vX.Y.md`)
- [x] 10.2 Update the image row of the `README.md` and `readme.md` table (maximum time 300 s)
- [x] 10.3 `docs/api-spec.yml` and `docs/data-model.md` do not change (record the check) — a search of both for `flux-2`, `seedream`, `maxTimeSeconds` and `imageReferenceModel` finds nothing
- [x] 10.4 Run `graphify update .`
- [ ] 10.5 Open the pull request linking JOS-230 and JOS-202; archive the change after merge (`openspec archive switch-reference-image-model --skip-specs`, because there is no spec delta)
