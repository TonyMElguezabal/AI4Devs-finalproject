## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create branch `feature/jos-265-check-generated-clip` from `origin/feature/entrega-3-JAME` (`bc9937be`, with JOS-263 and JOS-209 merged) with `--no-track`
- [x] 0.2 Verify the branch was created and is the current branch

## 1. Backend: The clip check (TDD; design Decisions 1-2)

- [x] 1.1 Write failing tests for `judgeClip` (pure): each rule of Decision 1 at its boundary, in order, with the reason wording; 2528×1440 at requested + 0.667 s passes
- [x] 1.2 Write failing tests for `checkClip` on clips made with ffmpeg (1920×1080 10 s; 1280×720; 1080×1920; 6 s for 10 s requested), on a truncated file and on non-MP4 bytes; and ffprobe missing (`FFPROBE_PATH` pointing nowhere) giving `unavailable`
- [x] 1.3 Create `backend/src/clipOutputCheck.ts` and make them pass

## 2. Backend: Run the check in the video stage (TDD; design Decision 3)

- [x] 2.1 Add `setClipCheck` to `orchestrator.ts` and install an accepting check in `test/setup.ts`
- [x] 2.2 Write failing orchestrator tests with the real check: a good clip completes the chunk; a 6 s clip for 10 s is a transient video failure with its reason and no stored file, and is retried; failing every attempt ends `failed` at `video` with the image kept; ffprobe missing is not retryable
- [x] 2.3 Replace `isMp4` with the check before `writeArtefactOnce`, and make them pass

## 3. Backend: Real clips from the stubs (design Decision 4)

- [x] 3.1 Write a failing test: the stub video provider with `clipFor` returns, for a 7 s request, a clip that passes `checkClip` at 7 s
- [x] 3.2 Add `clipFor` to `createStubVideoProvider` and `stubClipMaker` to `videoProvider.ts`; use it in `bootstrap.ts` and `packaging/smokeStubs.ts`
- [x] 3.3 Run the E14 workflow tests and the packaging smoke-stub tests, and record that a stubbed run reaches `final-video` through the real check
- [x] 3.4 Write a failing workflow test, then add the stub mode `USE_STUB_VIDEO_PROVIDER=short-clip` (a clip 3 s shorter than requested, at least 1 s) for manual and workflow testing of a refused clip: every scene fails at `video` with the check's reason and the session never assembles

## 4. Backend: Review and Update Existing Unit Tests (MANDATORY)

- [x] 4.1 Update tests that relied on the `ftyp`-only check (the "not an MP4" case now needs the real check); keep the others on the accepting check from `test/setup.ts`

## 5. Backend: Run Unit Tests and Verify Database State (MANDATORY)

- [x] 5.1 Capture the pre-test baseline of `backend/data/`
- [x] 5.2 Run the targeted tests and the full backend suite with a scratch `DB_PATH`, `PROJECTS_ROOT` and an empty `SECRETS_PATH`, plus `npm run typecheck` and `npm run lint`
- [x] 5.3 Verify the post-test state of `backend/data/` matches 5.1, and restore it if it does not
- [x] 5.4 Create report `openspec/changes/check-generated-clip/reports/YYYY-MM-DD-step-5-unit-test-and-db-verification.md`, including `checkClip` run read-only on the 46 real clips of 2026-10-29 (all must pass)

## 6. Backend: Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 6.1 Start the backend on a scratch store with literal env vars and every stub on; run a session to `final-video` through the real check
- [x] 6.2 Make the stub return a wrong clip (a short one), and confirm with `GET /sessions/:id` that the scene retries and then fails at `video` with the reason written for a person
- [x] 6.3 Record both in `reports/YYYY-MM-DD-step-6-manual-endpoint-testing.md`

## 7. Frontend: E2E Testing with Playwright MCP (MANDATORY if applicable - AGENT MUST EXECUTE)

- [x] 7.1 Open the failed session from 6.2 and confirm the scene shows as failed at the clip with the check's reason; record it in `reports/YYYY-MM-DD-step-7-e2e-testing.md`

## 8. Update Technical Documentation (MANDATORY)

- [x] 8.1 Add the two clip rules to PRD §7.2 (size: horizontal, at least 1920×1080; duration: requested −0.5 s to +1 s), with the product owner decision date
- [x] 8.2 Describe the clip check in `docs/backend-standards.md`; confirm `docs/api-spec.yml` and `docs/data-model.md` need no change
- [x] 8.3 Run `graphify update .`

## 9. Delivery

- [x] 9.1 Commit on the feature branch
- [ ] 9.2 Ask before pushing. Open a PR into `feature/entrega-3-JAME` that explains the motivation and the measured real clips
