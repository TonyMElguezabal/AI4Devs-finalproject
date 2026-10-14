# Tasks — Fix the RunningHub video adapter (JOS-196)

Every code change starts with a failing test (TDD), and every scenario in `specs/runninghub-video-adapter/spec.md` has at least one test. Tests inject `fetchFn`; none reaches the network or needs `.secrets.json`. Backend code uses only erasable TypeScript syntax.

## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create branch `feature/jos-196-fix-runninghub-adapter` from `origin/feature/entrega-2-JAME` (worktree `../AI4Devs-jos-196`); no upstream set
- [x] 0.2 Verify the branch is current and based on the integration head (`2fa63dc`)

## 1. Rewrite the adapter tests to the live shapes (TDD, failing first)

- [ ] 1.1 Rewrite the upload fixtures: the request is `multipart/form-data` with a `file` part holding the image bytes, the answer `{code:0, msg:"success", data:{download_url}}`; add the `errorCode` `1000` envelope test
- [ ] 1.2 Rewrite the submit fixtures: the request goes to `VIDEO_PROVIDER.endpoint` with `prompt`, `duration`, `resolution`, `firstFrameUrl`; the answer is `{taskId, status:"QUEUED", errorCode:""}`; add the refused-submit envelope test and a `data.taskId` fallback test
- [ ] 1.3 Rewrite the query fixtures: `POST /openapi/v2/query` with `{taskId}`; `status` `QUEUED`/`RUNNING` → pending, `SUCCESS` with `results[0].url` → temporary-url success, `FAILED` → transient, `SUCCESS` with `results: null` → transient
- [ ] 1.4 Update `adapters-no-hidden-retries.test.ts` and any other test that pins the old paths; run the targeted files and confirm they fail for the right reason

## 2. Implement (design Decisions 1-4)

- [ ] 2.1 Change `createRunningHubVideoProvider`: multipart upload reading `data.download_url`, submit to `VIDEO_PROVIDER.endpoint` reading `taskId`, query at `/openapi/v2/query` reading `status` and `results[0].url`, error envelopes as readable transient failures. Make group 1 pass
- [ ] 2.2 Update the real-provider contract test (skipped without a key) to the same shapes

## 3. Review and Update Existing Unit Tests (MANDATORY)

- [ ] 3.1 Confirm which test files mention RunningHub paths or the old response fields; update only those that pin the wrong shapes, and record them

## 4. Run Unit Tests and Verify Database State (MANDATORY)

- [ ] 4.1 Capture the pre-test state (temporary `DB_PATH`/`PROJECTS_ROOT`, no `.secrets.json`)
- [ ] 4.2 Run the targeted tests, then the full backend suite, backend typecheck, frontend suite and typecheck
- [ ] 4.3 Verify the post-test state matches the baseline
- [ ] 4.4 Save `reports/YYYY-MM-DD-step-4-unit-test-and-db-verification.md`

## 5. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [ ] 5.1 With the account's key in a throwaway credentials file, run the three adapter calls against the live API for one 5-second clip: upload, submit, poll until `SUCCESS`, download the clip, and check it with `ffprobe`; record each request shape and answer (without the key) and the cost reported in `usage`
- [ ] 5.2 Error case: an upload of a non-image body and a poll of an unknown task id answer with readable transient failures
- [ ] 5.3 Save `reports/YYYY-MM-DD-step-5-live-api-check.md` and delete the throwaway credentials file

## 6. E2E Testing with Playwright MCP (MANDATORY if applicable)

- [ ] 6.1 Not run in this change: the browser run of a real session through the video stage is the product owner's script-to-video E2E on the local executable (JOS-194); record its result here when done

## 7. Update Technical Documentation (MANDATORY)

- [ ] 7.1 `docs/backend-standards.md`: correct the RunningHub adapter paragraph (multipart upload, model endpoint, `/openapi/v2/query`)
- [ ] 7.2 Check `docs/api-spec.yml` and `docs/data-model.md` need no change; record the result

## 8. Close

- [ ] 8.1 Comment on JOS-196 with the shapes fixed, the live check and the PR link; open the PR into `feature/entrega-2-JAME` after the user's go-ahead
- [ ] 8.2 After merge, archive with `/opsx:archive`
