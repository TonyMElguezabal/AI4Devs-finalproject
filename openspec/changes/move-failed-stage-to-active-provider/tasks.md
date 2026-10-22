## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create branch `feature/jos-172-move-failed-stage` from `origin/main` with `--no-track`, in the worktree `../AI4Devs-jos-172`
- [x] 0.2 Verify the branch was created and is the current branch of that worktree

## 1. Gate

- [x] 1.1 `git fetch`. Confirm JOS-171 and JOS-218 (PR #88) are on `origin/main`, and rebase or merge `origin/main` into this branch. If either is missing, stop.
- [x] 1.2 Confirm the base still matches design.md § Context: where each binding lives, that `startNewCycle` copies the latest attempt's provider, how a failed scene's stage is told apart, the four lock triggers and their DDL constants, and `activeVideoDurations()`. Update design.md first if anything differs.
- [x] 1.3 Draft the next PRD version (v1.15: §11.2, §2.1, §2.3, §16, plus the exception to "a chunk's requested duration and speed factor never change") and mark it as awaiting the product owner's approval, before any code.

## 2. Backend: the retry takes the stage's binding (TDD; design Decision 5)

- [x] 2.1 Write failing tests for `startNewCycle`: with a stage instance bound to `stub-b` and a latest failed attempt recorded for `stub-a`, the new cycle's first attempt records `stub-b` (voice, reasoning and alignment steps); with no binding it still copies the latest attempt's provider; an alignment step whose latest attempt is `elevenlabs-native` keeps `native`; automatic retries inside a cycle still copy the previous attempt.
- [x] 2.2 Implement the binding lookup in `startNewCycle`. Make 2.1 pass.

## 3. Backend: the failed-stage finder (TDD; design Decisions 2, 3)

- [x] 3.1 Write failing tests for `listFailedStages()` with stub adapters `stub-a` and `stub-b`:
  - a failed voice stage, a failed alignment step (no timestamps stored), a failed reasoning step (timestamps stored), a failed image scene and a failed video scene, each bound to `stub-a` while `stub-b` is active, are listed with the session, stage, scene number, both providers' labels and the cause;
  - a stage bound to the active provider, a stage that has not failed, a stage with no binding (native timestamps) and a session-level failure with no manual retry are not listed;
  - a legacy image or video binding resolves to the seeded profile before it is compared;
  - assembly is never listed.
- [x] 3.2 Implement `failedStages.ts`. Make 3.1 pass.

## 4. Backend: rebinding in the store (TDD; design Decisions 1, 4)

- [x] 4.1 Write failing tests for the store functions:
  - rebinding a session-level stage and a scene's image or video binding is conditional on the expected old binding and on the stage still being failed, and changes nothing otherwise;
  - `rebindFailedClip` replaces `requested_duration_seconds`, `duration_warning`, `speed_factor` and `speed_factor_warning` for a scene that is `failed` with an image result and no clip result, and refuses any other scene;
  - the narration interval, instructions, image result and status are untouched;
  - the four lock triggers exist again after it, and a direct SQL update of each of the four columns is refused with the `locked:` error, also after a rollback caused by a failure inside it;
  - no source file other than `db.ts` drops those triggers (a static check, like the `rmSync` check).
- [x] 4.2 Implement the rebinding functions and `rebindFailedClip` in one transaction. Make 4.1 pass.

## 5. Backend: the move command (TDD; design Decisions 1, 3, 4)

- [x] 5.1 Write failing tests for `moveFailedStage` for each of the five stage kinds:
  - the stage is bound to the active provider and nothing else changes: no request is sent, no attempt is recorded, the state stays failed (AC2 first half);
  - the retry that follows goes to the new provider (voice, reasoning, alignment through the session retries; image and video through `manualRetry`), and the earlier attempts keep `stub-a` (AC2);
  - a moved video stage chooses its duration again from the active provider's range: 8 s interval, 5–15 s to 5–7 s gives 7 s and factor 8/7; a 14 s interval to 5–10 s gives 10 s with `exceeds-maximum`; the interval, instructions and image are unchanged (AC4);
  - the other scenes of the session, their images and clips, the voice-over and the timestamps are not touched and nothing is sent for them (AC3);
  - refusals change nothing: unknown session or scene, not failed, already on the active provider, retry scheduled or in flight, no manual retry, active provider not usable (a profile with no key);
  - after a move the active provider changes again and the stage stays where it was moved;
  - nothing moves by itself when retries are exhausted.
- [x] 5.2 Implement `moveFailedStage` (guards, rebinding, clip values) and a broadcast of the session after a move. Make 5.1 pass.

## 6. Backend: admin API (TDD; design Decision 6)

- [x] 6.1 Write failing route tests:
  - `GET /admin/failed-stages` returns the rows of 3.1 and none for a stage on the active provider;
  - `POST /admin/failed-stages/to-active-provider` returns 200 with the new provider and, for video, the requested duration;
  - 404 for an unknown session or scene; 409 with each reason of the spec; 400 for an unknown stage, a missing `sceneId` for image or video, or a `sceneId` for a session-level stage;
  - both routes return 401 without Administrator access and change nothing (AC5);
  - the routes appear in the generated OpenAPI document.
- [x] 6.2 Implement the routes with zod schemas behind JOS-173's gate. Both routes are a `GET` and a `POST`, so the surface test's "no PUT, PATCH or DELETE" guard needs no exemption. Make 6.1 pass.

## 7. Frontend: the "Failed stages" section on /admin (TDD; design Decision 7)

- [x] 7.1 Write failing component tests:
  - the list with the session title, the stage and scene, both providers' labels, the cause and the move button named `Move {stage} of {session} to {active}` (with the scene);
  - the empty state text;
  - a move sends the `POST`, shows "Moved. Retry it from the session page." with a link to the session, and reloads the list;
  - a 409 shows its reason in words and reloads; a 401 locks the page again.
- [x] 7.2 Add the client calls and the section inside the `/admin` tools. Make 7.1 pass.

## 8. Review and Update Existing Unit Tests (MANDATORY)

- [ ] 8.1 Review the tests that rely on a retry copying the latest attempt's provider, on the locked columns or on the `/admin` route list: `retry-*`, `decomposition-*`, `voice-over-*`, `clip-duration-*`, `speed-factor-*`, `scene-registration-*`, `content-lock`, `session-api-surface`, the `admin-*` route tests. Update them where the new behaviour requires it.
- [ ] 8.2 Map every scenario in `specs/failed-stage-move/spec.md`, the two modified specs and JOS-172 AC1–AC5 to at least one test. List the mapping in the step 9 report.
- [ ] 8.3 Confirm module test coverage has not decreased (compare against this change's propose commit).

## 9. Run Unit Tests and Verify Database State (MANDATORY)

- [ ] 9.1 Capture the pre-test baseline of the default store: row counts per table, applied migrations and `data/projects/` contents.
- [ ] 9.2 Run the targeted tests from groups 2–7.
- [ ] 9.3 Run `npm run typecheck` and the full `npm test` in both `backend` and `frontend`, with no `backend/.secrets.json`, no settings override and no vendor key in the environment, and a scratch `DB_PATH`, `PROJECTS_ROOT` and `PROVIDER_KEY_PATH`.
- [ ] 9.4 Verify the post-test state matches the baseline; restore it if not.
- [ ] 9.5 Create the report `openspec/changes/move-failed-stage-to-active-provider/reports/YYYY-MM-DD-step-9-unit-test-and-db-verification.md`.
- [ ] 9.6 Mark this step complete only after the tests pass and the report file exists.

## 10. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [ ] 10.1 Start the real server on a scratch store, projects folder and key file, with two stub adapters per stage registered through the test seams (the launcher of the JOS-218 step 10 report) and `ALLOW_TEST_ENDPOINTS=1`.
- [ ] 10.2 Without Administrator access, `GET /admin/failed-stages` and `POST /admin/failed-stages/to-active-provider` return 401 and nothing changes.
- [ ] 10.3 Make one failed stage of each kind on `stub-a` (a failing stub per stage, retries exhausted), switch every active provider to `stub-b`, and check `GET /admin/failed-stages` lists the five with both providers.
- [ ] 10.4 Move each one: 200, the binding is `stub-b`, no request reached either stub, the state is still failed; then retry each with the existing retry route: the request goes to `stub-b` and the stage completes, the attempts before the move still read `stub-a`.
- [ ] 10.5 Move a clip whose new provider admits other durations (a profile admitting 5 to 7 s added on `/admin`): the response and `GET /sessions/:id` show the new requested duration, factor and warning; the interval, instructions and image are as before; a direct `UPDATE` of the four columns in the SQLite file is refused.
- [ ] 10.6 Refusals: a stage already on the active provider, a stage retried between listing and moving, an unknown scene (404), a missing `sceneId` (400), an active provider with no key (409 `not-usable`); the store is unchanged.
- [ ] 10.7 Restart: the bindings and the re-chosen duration hold. Delete the created sessions, profiles, key file and the scratch store and folder. Confirm the default store is untouched. Save `openspec/changes/move-failed-stage-to-active-provider/reports/YYYY-MM-DD-step-10-manual-endpoint-testing.md`.

## 11. E2E Testing with the browser (MANDATORY if applicable - AGENT MUST EXECUTE)

- [ ] 11.1 Applicability: a new `/admin` section, so this step applies.
- [ ] 11.2 Run the backend (scratch store and key file, two stub adapters per stage) and the frontend with one failed stage on `stub-a` and `stub-b` active. Without the password: no failed stage is shown. With it: the stage is listed with both providers and its cause.
- [ ] 11.3 Click the move button: the row says "Moved. Retry it from the session page." and leaves the list; open the session page, retry the stage with its usual button, and confirm in its diagnostics that it ran on `stub-b` while its earlier attempts show `stub-a`.
- [ ] 11.4 Move a failed clip to a provider with other durations and confirm the scene details show the new requested duration and speed factor.
- [ ] 11.5 Restore the environment and save `openspec/changes/move-failed-stage-to-active-provider/reports/YYYY-MM-DD-step-11-e2e.md`.

## 12. Update Technical Documentation (MANDATORY)

- [ ] 12.1 `docs/PRD.md`: the next version (keep the previous one as `docs/PRD-v<prev>.md`) with §11.2, §2.1 and §2.3 changed, and a §16 change log entry.
- [ ] 12.2 `docs/api-spec.yml`: `GET /admin/failed-stages` and `POST /admin/failed-stages/to-active-provider`, with 200, 400, 401, 404 and 409.
- [ ] 12.3 `docs/data-model.md`: the exception to the locks on the four duration and speed columns, the one function that lifts them, and the binding that a manual retry now reads.
- [ ] 12.4 `docs/backend-standards.md`: `rebindFailedClip` is the only code that lifts the duration and speed locks; `startNewCycle` takes the stage's binding; a move binds and sends nothing.
- [ ] 12.5 `docs/frontend-standards.md`: the accessible names of the Failed stages section. `docs/development_guide.md`: how an Administrator unblocks a session.
- [ ] 12.6 Create the follow-up Linear tickets only if an open question of design.md is decided to be built (move and retry in one click; reopening a retry for a not-retryable session failure; a move log), assigned to jose.elguezabal@gmail.com with label `type:feature`.
- [ ] 12.7 Run `graphify update .`.
