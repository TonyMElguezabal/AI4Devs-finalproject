# Tasks — Prevent the final video while any scene is incomplete (JOS-150, US-17)

Every code change starts with a failing test (TDD), and every scenario in `specs/scene-completion-gate/spec.md` has at least one test. Scene states that no running code produces yet (`video-generating`, `chunk-complete`) are set directly in tests, as `scene-registration-session.test.ts` already does.

## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create branch `feature/jos-150-gate-assembly-on-complete-scenes` from `feature/entrega-2-JAME` (the MVP integration branch; MVP changes do not target `main`), with no upstream set
- [x] 0.2 Verify the branch was created and is the current branch

## 1. Gate

- [x] 1.1 Confirm `deriveSessionState` on the base branch still has the three gaps this change fixes (the hand-written processing list without `video-generating`, all complete → `final-video`, `failedPhase: "image"`). If another story already changed it, update design.md before coding
- [x] 1.2 Check whether a JOS-146 or US-16b branch has touched `deriveSessionState`, `sessionStateMachine.ts` or the session payload since this proposal; record any overlap
- [x] 1.3 Confirm no test besides `scene-registration-session.test.ts` asserts `final-video` from derivation, and none asserts `failedPhase: "image"`

## 2. The gate (TDD, pure; design Decisions 1 and 2)

- [x] 2.1 Failing tests in `assembly-gate.test.ts`: open when every scene is `chunk-complete`; closed for an empty list; closed with `failedSceneIndexes` for a failed scene; closed with `processingSceneIndexes` for each non-final state (`submitted`, `image-generating`, `image-complete`, `video-generating`); both lists ascending when scenes are given out of order
- [x] 2.2 Implement `isSceneSettled` and `assemblyGate` in `assemblyGate.ts`, fully typed, and make 2.1 pass

## 3. Session state derivation (TDD; design Decisions 2-4)

- [x] 3.1 Failing tests in a new `scene-completion-session.test.ts` for `deriveSessionState`: a failed scene beside one `video-generating` derives `chunks-processing`, and so does one beside a `submitted` scene; all failed or complete with at least one failed derives `failed`, `failedPhase: "scenes"`, `failedSceneIndexes` ascending; all complete derives `final-video-generating`; all complete with `hasFinalVideo: true` derives `final-video`; a scene-less decomposition failure is unchanged and has no `failedSceneIndexes`
- [x] 3.2 Rewrite the scene branch of `deriveSessionState` on top of `assemblyGate`/`isSceneSettled`; add `hasFinalVideo` to `SessionProgress` (default false); return `failedSceneIndexes`
- [x] 3.3 Update `scene-registration-session.test.ts`'s "is final-video once every chunk has reached chunk-complete" test to the new rule (`final-video-generating`), as design Risk 1 expects
- [x] 3.4 Make 3.1 and 3.3 pass

## 4. Transition table (TDD; design Decision 5)

- [x] 4.1 Add `["chunks-processing", "final-video-generating"]` and `["chunks-processing", "failed"]` to `session-state-machine.test.ts`'s `ALLOWED` list (the closed-table test then fails), then extend `ALLOWED_SESSION_TRANSITIONS` to make it pass

## 5. Session read and live updates (TDD)

- [x] 5.1 Failing tests (API surface): `GET /sessions/:id` carries `failedSceneIndexes` only on a scene-failed session; the snapshot the live updates resync from carries the same; the generated OpenAPI documents it on responses only, never on a request body
- [x] 5.2 Failing test of the sequence in the spec: scene 2 `failed` while scene 3 is `image-generating` reads `chunks-processing`; after scene 3 reaches `chunk-complete` and a broadcast, the received snapshot is `failed` with `failedSceneIndexes: [2]`
- [x] 5.3 Failing tests for kept results: in a `failed` session, a `chunk-complete` sibling's image and video downloads answer 200, and a scene failed after storing its image still carries its `result` on the read
- [x] 5.4 Failing test: with every scene `chunk-complete` (no final video), `GET /sessions/:id/download/final-video` answers 409
- [x] 5.5 Add `failedSceneIndexes` to `SessionEventPayload` (`types.ts`), `toSnapshot` and the Zod session schema (`routes.ts`, with a `.describe()` citing PRD §8.1); make 5.1-5.4 pass

## 6. Frontend header (TDD)

- [x] 6.1 Failing component test in `test/components.test.tsx`: a `failed` session with `failedPhase: "scenes"` and `failedSceneIndexes: [2, 5]` renders the phase and "2, 5"; a session failed in another phase renders no scene list
- [x] 6.2 Add `failedSceneIndexes?: number[]` to the frontend `SessionEventPayload`; render it in `SessionHeader.tsx` next to the failed phase; make 6.1 pass

## 7. Review and Update Existing Unit Tests (MANDATORY)

- [x] 7.1 Review every test that derives or reads a scene-based session state (`image-stage.test.ts`, `orchestrator.test.ts`, `scene-registration-session.test.ts`, `narration-interval-immutability.test.ts`) for assumptions this change breaks, beyond the one 3.3 already updates
- [x] 7.2 Confirm every scenario in `specs/scene-completion-gate/spec.md` has at least one test; list the mapping in the step 8 report
- [x] 7.3 Confirm module test coverage has not decreased (compare against this change's propose commit)

## 8. Run Unit Tests and Verify Database State (MANDATORY)

- [x] 8.1 Capture the pre-test baseline of the default store: row counts per table, applied migrations, trigger list, and `data/projects/` contents
- [x] 8.2 Run the targeted tests (gate, derivation, transition table, API surface, components)
- [x] 8.3 Run `npm run typecheck` and the full `npm test` in both `backend` and `frontend`
- [x] 8.4 Verify the post-test state matches the baseline; restore it if not
- [x] 8.5 Create the report `openspec/changes/gate-assembly-on-complete-scenes/reports/YYYY-MM-DD-step-8-unit-test-and-db-verification.md`
- [x] 8.6 Mark this step complete only after the tests pass and the report file exists

## 9. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 9.1 Start the real server on a scratch store and scratch projects folder; confirm `GET /health`
- [x] 9.2 Create a session and register chunks directly (`registerDecomposition`, as JOS-148's step 9 did); set one scene `failed` and one `video-generating` and `curl GET /sessions/:id`: `chunks-processing`, no `failedSceneIndexes`
- [x] 9.3 Move the generating scene to `chunk-complete`: `failed`, `failedPhase: "scenes"`, `failedSceneIndexes` naming the failed scene; the complete scene's downloads answer 200
- [x] 9.4 In a second session, set every scene `chunk-complete`: `final-video-generating`, and `GET .../download/final-video` answers 409
- [x] 9.5 `curl GET /docs/json`: `failedSceneIndexes` documented on responses only
- [x] 9.6 Clean up the scratch store and folder; confirm the default store is untouched; save `openspec/changes/gate-assembly-on-complete-scenes/reports/YYYY-MM-DD-step-9-manual-endpoint-testing.md`

## 10. E2E Testing with Playwright MCP (MANDATORY if applicable - AGENT MUST EXECUTE)

- [x] 10.1 Decide applicability: the session header changes, so it applies
- [x] 10.2 Run backend (scratch store) and frontend; prepare a session whose scenes leave it `failed` with two failed scenes
- [x] 10.3 Open the session page and confirm the header shows the failed phase and both scene indexes, and that the complete scenes' rows still offer their downloads
- [x] 10.4 Restore the environment and save `openspec/changes/gate-assembly-on-complete-scenes/reports/YYYY-MM-DD-step-10-e2e.md`

## 11. Update Technical Documentation (MANDATORY)

- [ ] 11.1 `docs/data-model.md`: update the session `state` bullet (scene rule per §8.1 v1.3, `final-video` only with a final video, `failedPhase: "scenes"`, derived `failedSceneIndexes`)
- [ ] 11.2 `docs/api-spec.yml`: regenerate from `GET /docs/json`; confirm the only content change is `failedSceneIndexes`
- [ ] 11.3 `docs/backend-standards.md`: record the gate as the single launch condition for assembly and the settled-state definition
- [ ] 11.4 `docs/PRD-v1.3.md`: check §7.3, §8.1 and §10.2 need no wording change

## 12. Close out

- [ ] 12.1 Ask the user before commenting on JOS-149 that US-16b's launcher must call `assemblyGate` and set `hasFinalVideo`
- [ ] 12.2 Ask before pushing; open the PR with a description linking to JOS-150
- [ ] 12.3 Obtain review by at least one human, not only AI agents
- [ ] 12.4 Archive the OpenSpec change after merge
