# Tasks — View progress by phase (JOS-168, US-18)

Every code change starts with a failing test (TDD), and every scenario in `specs/session-phase-progress/spec.md` has at least one test. Tests set session states, failures and attempts that no running stage produces directly, through the store, as earlier stories' tests do. Backend code uses only erasable TypeScript syntax (no enums, no parameter properties), because the server runs in Node's strip-only mode.

## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create branch `feature/jos-168-view-progress-by-phase` from `origin/feature/entrega-2-JAME` (the MVP integration branch; MVP changes do not target `main`), with no upstream set
- [x] 0.2 Verify the branch was created and is the current branch

## 1. Gate

- [x] 1.1 `git fetch`, then confirm the base still matches design.md § Context:
  - `deriveSessionState` returns `failedPhase` only as `failure.phase` or `"scenes"`;
  - `toSnapshot` does not expose `run.failure`;
  - `obtainNarrationTimestamps` clears the failure only on success;
  - `SessionPage` renders header, scene list and download one after another.

  If another story changed any of these, update design.md before coding.

  Result (2026-10-05, base `99552f5`): all four hold. `deriveSessionState` returns `failedPhase` only as `failure.phase` or `"scenes"`; `toSnapshot` does not expose `run.failure`; `narrationTimestampsPhase.ts` clears the failure only in `succeed`; `SessionPage` renders header, scene list and download in sequence.
- [x] 1.2 Check whether PR #25 (JOS-149, `assemble-final-video`) has merged into `feature/entrega-2-JAME`. If it has, rebase, keep its `finalVideoUrl` and `hasFinalVideo`, and check whether it now derives `failedPhase: "assembly"`. If it does, add the `assembly` → `final-video-generating` row to design Decision 5 and the spec before coding. Record the result here.

  Result: PR #25 merged into `feature/entrega-2-JAME` at `99552f5`; this branch was rebased onto it (local, unpushed, one commit). `finalVideoUrl` and `hasFinalVideo` are in place. It does **not** derive `failedPhase: "assembly"`: `deriveSessionState` still returns only `failure.phase` or `"scenes"`. Decision 5 and the spec need no `assembly` row; the Open Question stands.
- [x] 1.3 Check whether `feature/jos-136-generate-voice-over` has moved: whether it derives `voice-over-generating` or adds a top-level `failure` to the session read. Record any overlap with Decisions 2, 3 and 5.

  Result: PR #26 (JOS-136) is still open, so its changes are not in this base. On its branch `deriveSessionState` already derives `voice-over-generating` from `progress.voiceAttemptInFlight`, but checks the recorded failure first, so a voice-over retry still reads `failed`; Decision 5's rule fixes that and must be applied there when #26 merges (the in-flight check goes before the failure check, gated on `queuedAt >= failure.occurredAt`). It adds a top-level `failure` (`state === "failed" && run.failure`), which must come from the same `run.failure` as the phase entry (Decision 3). Also, `bounded-retry-policy` (JOS-184, PR #27, open) records a retry wait as an attempt with outcome `scheduled`, not `in-flight`. A phase waiting for its next automatic attempt is then not retried-in-flight and keeps reading `failed` only if the session failure is still recorded; JOS-184 keeps the session failure unset until the budget is exhausted, so the session stays in its in-progress state. No change to this design is needed now; re-check the rule against both when they merge.

## 2. Backend: phase derivation (TDD; design Decisions 1-4)

- [x] 2.1 Write failing unit tests in a new `backend/test/phase-progress.test.ts` for `derivePhaseProgress`:
  - one test per non-failed session state, against design Decision 2's table;
  - `failed` with each of `voice-over`, `decomposition`, `scenes`, `assembly`;
  - `failed` with a missing or unknown `failedPhase` throws;
  - the order is always the four phases.
- [x] 2.2 Write failing tests for `failure`:
  - it is carried (cause and retryable only) on the failed voice-over or decomposition entry, and on an assembly entry given an assembly failure;
  - it is absent on the `scenes` entry and on every entry that is not failed;
  - no `occurredAt` is ever present.
- [x] 2.3 Write failing tests for `heldCount`:
  - stage-to-phase mapping, with image and video summed into scenes;
  - 0 everywhere when `held` is empty.
- [x] 2.4 Implement `derivePhaseProgress` and its types (`Phase`, `PhaseStatus`, `PhaseProgress`) in `orchestrator.ts` / `types.ts`; make 2.1-2.3 pass.

## 3. Backend: retry in flight (TDD; design Decision 5)

- [x] 3.1 Write failing tests in `backend/test/phase-progress.test.ts` (pure, through `deriveSessionState` with `progress.retryInFlight`), then in `narration-timestamps-session.test.ts` (through the store). Cover:
  - a decomposition failure plus a later in-flight `timestamps` attempt derives `chunk-decomposing`, with the failure still stored;
  - a voice-over failure plus a later in-flight `voice-over` attempt derives `voice-over-generating`;
  - an in-flight attempt queued before the failure still derives `failed`;
  - a retry that fails again derives `failed` with the new cause.
- [x] 3.2 Write a failing-or-pinning test that retrying a failed scene in a `failed` (scenes) session derives `chunks-processing`, through the existing retry endpoint. It may pass on first run; record that it pins existing behaviour.

  Result: it passed on first run (the session is paused so the retry is held and no provider is called), so it pins existing behaviour. It lives in `test/phase-retry-in-flight.test.ts`, with the voice-over case.
- [x] 3.3 Implement the retry-in-flight rule in `deriveSessionState` and compute `retryInFlight` in `toSnapshot` from `getStageAttempts` and `run.failure`; make 3.1 pass.

## 4. Backend: session representation (TDD)

- [x] 4.1 Write failing tests in `session-api-surface.test.ts`:
  - `GET /sessions/:id` carries `phases`, validated by the response schema;
  - a live snapshot carries the same `phases` as the read;
  - the generated OpenAPI (`/docs/json`) documents `phases` with its four status values.
- [x] 4.2 Attach `phases` in `toSnapshot`, from the one `sessionHeldWork` call already there; add `phases` to `sessionResponseSchema` with descriptions; make 4.1 pass.

## 5. Frontend: types, status and actions (TDD; design Decisions 6 and 7)

- [x] 5.1 Add `phases` to `SessionEventPayload` in `frontend/src/types.ts`, and add `phases` to every test fixture that builds a session payload.
- [x] 5.2 Write failing tests in `test/components.test.tsx`:
  - `phaseActions` returns no action for every phase and status;
  - `phaseStatusClass` maps the four statuses through `styles/status.ts`;
  - the status-to-label map gives `Not started`, `In progress`, `Complete`, `Failed`.
- [x] 5.3 Implement `frontend/src/phaseActions.ts` and `phaseStatusClass`; make 5.2 pass.

## 6. Frontend: phase sections (TDD; design Decisions 6 and 8)

- [x] 6.1 Write failing tests for `PhaseSection` and `SessionPage`:
  - the four sections appear in order, with names `Voice-over phase`, `Decomposition phase`, `Scenes phase`, `Final video phase`;
  - each shows its status label;
  - the scene list is inside `Scenes phase` and the final-video download inside `Final video phase`;
  - the header still shows the session state, failed phase, failed scenes and pause and continue.
- [x] 6.2 Write failing tests for failure and held work:
  - a failed decomposition section shows `Failed`, the cause as an alert, and no retry button;
  - an `assembly` failure fixture shows `Failed` and its cause in `Final video phase`;
  - a scenes failure shows `Failed` with scene 2's row offering retry and correction;
  - `heldCount` 1 shows `Waiting for you to continue (1 held)`.
- [x] 6.3 Write failing tests for live re-render (AC2): re-rendering `SessionPage` with a new snapshot moves Decomposition to `Complete` and Scenes to `In progress`, and a retry going `in-progress` removes the alert.
- [x] 6.4 Implement `frontend/src/components/PhaseSection.tsx` and reorganize `SessionPage.tsx`; add the section styles to `app.css` using existing tokens only; make 6.1-6.3 pass.

## 7. Review and Update Existing Unit Tests (MANDATORY)

- [x] 7.1 Review backend tests that assert the exact session payload shape, and frontend tests that locate the scene list or the download by position, for assumptions this change breaks; update them.
  - Result: the backend exact-key assertion in `session-read.test.ts` now lists `phases` (done in group 4); the frontend `SessionPage` tests find rows by role and name, so the new sections broke none; `makeSession` and the `useLiveSession` snapshot fixture gained `phases`.
- [ ] 7.2 Confirm every scenario in `specs/session-phase-progress/spec.md` has at least one test, and map each ticket AC (1-5) to its tests; list both mappings in the step 8 report.
- [ ] 7.3 Confirm module test coverage has not decreased (compare against this change's propose commit).

## 8. Run Unit Tests and Verify Database State (MANDATORY)

- [ ] 8.1 Capture the pre-test baseline of the default store: row counts per table, applied migrations, trigger list, and `data/projects/` contents.
- [ ] 8.2 Run the targeted tests (`phase-progress`, `narration-timestamps-session`, `session-api-surface`, `components`).
- [ ] 8.3 Run `npm run typecheck` and the full `npm test` in both `backend` and `frontend`. Run the backend suite once more in a fresh worktree without `backend/.secrets.json`, so local provider credentials cannot mask a failure.
- [ ] 8.4 Verify the post-test state matches the baseline; restore it if not.
- [ ] 8.5 Create the report `openspec/changes/view-progress-by-phase/reports/YYYY-MM-DD-step-8-unit-test-and-db-verification.md`.
- [ ] 8.6 Mark this step complete only after the tests pass and the report file exists.

## 9. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [ ] 9.1 Start the real server on a scratch store and scratch projects folder; confirm `GET /health`.
- [ ] 9.2 Create a session with `POST /sessions`; `curl GET /sessions/:id` shows `phases` with four entries in order.
- [ ] 9.3 Prepare in the scratch store, then `curl` each:
  - a decomposition failure: the entry is `failed` with cause and `retryable`;
  - the same session with a later in-flight `timestamps` attempt: the state is `chunk-decomposing` and the entry is `in-progress` with no `failure`;
  - a paused session with held decomposition: `heldCount` 1.
- [ ] 9.4 Error case: `curl GET /sessions/<unknown>` still answers 404. `curl GET /docs/json` documents `phases`.
- [ ] 9.5 Clean up the scratch store and folder; confirm the default store is untouched; save `openspec/changes/view-progress-by-phase/reports/YYYY-MM-DD-step-9-manual-endpoint-testing.md`.

## 10. E2E Testing with Playwright MCP (MANDATORY if applicable - AGENT MUST EXECUTE)

- [ ] 10.1 Decide applicability: the session page layout changes, so it applies.
- [ ] 10.2 Run backend (scratch store) and frontend; open a session page and confirm the four sections by accessible name, in order.
- [ ] 10.3 Advance the session on the backend (for example, register scenes) and confirm the sections update without a reload.
- [ ] 10.4 Record a decomposition failure on a second session: the Decomposition section shows `Failed`, the cause and no retry button. Then record an in-flight `timestamps` attempt: the section shows `In progress` without a reload.
- [ ] 10.5 Pause a session with held work and confirm the held text in the right section, alongside the header's paused marker.
- [ ] 10.6 Restore the environment and save `openspec/changes/view-progress-by-phase/reports/YYYY-MM-DD-step-10-e2e.md`.

## 11. Update Technical Documentation (MANDATORY)

- [ ] 11.1 `docs/api-spec.yml`: regenerate from `GET /docs/json`; confirm the only change is the `phases` field.
- [ ] 11.2 `docs/data-model.md`: record that `phases` and the retry-in-flight state are derived from existing records, never stored.
- [ ] 11.3 `docs/frontend-standards.md`: add the four phase-section accessible names to the naming table, and record `phaseActions` as the one place phase actions are derived, extended by US-23 to US-27.
- [ ] 11.4 `docs/backend-standards.md`: record that the in-progress state of a retried phase is derived from an in-flight attempt newer than the recorded failure.

## 12. Close out

- [ ] 12.1 Ask the user before commenting on JOS-149 (assembly failure at session level, design Open Questions) and on the US-23 to US-27 tickets (extend `phaseActions`).
- [ ] 12.2 Ask before pushing; open the PR against `feature/entrega-2-JAME` with a description linking to JOS-168.
- [ ] 12.3 Obtain review by at least one human, not only AI agents.
- [ ] 12.4 Archive the OpenSpec change after merge.
