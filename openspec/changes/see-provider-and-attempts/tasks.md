# Tasks — See provider and attempts per stage (JOS-166, US-34)

Every code change starts with a failing test (TDD), and every scenario in `specs/stage-diagnostics/spec.md` has at least one test. Attempt records that no running stage produces in a test (voice-over, assembly) are inserted through the store, as earlier stories' tests do. Backend code uses only erasable TypeScript syntax (no enums, no parameter properties).

## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create branch `feature/jos-166-see-provider-and-attempts` from `feature/jos-168-view-progress-by-phase`. It is stacked because AC3 renders inside JOS-168's phase sections. No upstream is set.
- [x] 0.2 Verify the branch was created and is the current branch.

## 1. Gate

- [x] 1.1 Confirm `view-progress-by-phase` (JOS-168) is implemented and that its `phases` entry shape and `PhaseSection` match design.md. Confirmed 2026-10-05: JOS-168 is merged on `feature/entrega-2-JAME`; entries are `{ phase, status, heldCount, failure? }`; `PhaseSection.tsx` exists. This branch merged the integration branch (the only conflict was JOS-168's stale propose-time `tasks.md`, resolved with the integration version).
- [x] 1.2 `git fetch`; check whether PR #25 (JOS-149) has merged into `feature/entrega-2-JAME`. If it has:
  - confirm `stage_attempts.provider_id` accepts `null` for assembly;
  - confirm the `assembly` stage name.

  Result: merged. Assembly records `stage = 'assembly'` with `providerId: null` (the column is nullable since migration 13).
- [x] 1.3 Check the voice provider identifier recorded on `voice-over` attempts. It is `run.voiceProviderId ?? registry.defaultIdentifier`, and the default registry's identifier is `VOICE_PROVIDER.name`, `ElevenLabs` (`stub-voice` in tests and manual runs). Added to Decision 2's table.
- [x] 1.4 List every identifier the code can bind or record per stage, as the input to task 2.1. Image: `fal-ai/flux/dev` (`IMAGE_PROVIDER.model`), the placeholder `stub-image-provider`, and test adapter ids. Clip: `VIDEO_PROVIDER.endpoint`, `stub-video-provider`. Voice-over: `ElevenLabs`, `stub-voice`. Timestamps: `elevenlabs-native`, `elevenlabs-forced-alignment`. Decomposition (instructions): `openai-decomposition`. Assembly: `null`.
- [x] 1.5 Reconcile the artifacts with the merged base (2026-10-05): `retry-decomposition` (JOS-156) already records the instruction call as attempts of stage `decomposition`, so the planned `instructions` attempt stage, its recording and the retry-in-flight extension are dropped (design Decision 3, proposal, spec, group 3).

## 2. Backend: display values and allow-list (TDD; design Decisions 2 and 4)

- [x] 2.1 Write failing tests in a new `backend/test/stage-diagnostics.test.ts` for `describeProvider(stage, identifier)`, and for the mapping of the stored stage `decomposition` to the wire stage `instructions`:
  - each row of Decision 2's table;
  - an unknown identifier gives `Unknown provider` with `model: null`, logs once, and never returns the identifier;
  - every identifier from task 1.4 has an entry.
- [x] 2.2 Implement `backend/src/stageDiagnostics.ts` (`describeProvider`, the `StageDiagnostic` type); make 2.1 pass.

## 3. Backend: instruction attempts (design Decision 3)

- [x] 3.1 Confirm that nothing needs recording: `retry-decomposition` (JOS-156) already writes one `stage_attempts` row of stage `decomposition`, provider `openai-decomposition`, per division attempt, around the reasoning call (`decompositionPhase.ts`). The instruction diagnostic counts those rows (tests in task 4.2). The earlier plan to add an `instructions` attempt stage and to extend JOS-168's retry-in-flight rule is dropped.

## 4. Backend: scene and phase diagnostics (TDD; design Decisions 1 and 5)

- [ ] 4.1 Write failing tests in `scene-api-surface.test.ts`:
  - `stages.image` and `stages.video` counts come from `provider_requests` per stage;
  - image attempts are kept after the clip starts;
  - a manual retry adds to the count;
  - a `submitted` scene with the placeholder provider has no `stages.image`;
  - the scene has no top-level `provider` or `attempts`.
- [ ] 4.2 Write failing tests in `session-api-surface.test.ts` for phase `stages`:
  - voice-over;
  - timestamps (latest provider, total count) then instructions, counted from the stored stage `decomposition` rows and named `instructions` on the wire;
  - assembly as local assembly;
  - empty lists for stages that have not run and for the scenes phase;
  - the live snapshot equals the read.
- [ ] 4.3 Add a `countProviderRequests(sceneId, stage)` read in `db.ts`. Build `stages` in `sceneToPayload` and the phase `stages` in `toSnapshot`. Remove the scene's `provider` and `attempts` from the payload. Update the Zod response schemas, with `.strict()` on the diagnostic objects. Make 4.1-4.2 pass.

## 5. Backend: no confidential data (TDD; design Decision 4)

- [ ] 5.1 Write a failing test:
  - set sentinel values in `external_request_id`, `error_code`, `error_message` and `provider_requests.mode`;
  - load a test credentials fixture with a sentinel key;
  - assert that no sentinel and no `VIDEO_PROVIDER.endpoint` appears in the serialized `GET /sessions/:id` body or in a published snapshot.
- [ ] 5.2 Make 5.1 pass. It should pass once task 4 is complete; if it does not, fix the leak at its source rather than filtering the output.

## 6. Frontend: types and rendering (TDD; design Decision 6)

- [ ] 6.1 Update `frontend/src/types.ts`:
  - add `StageDiagnostic`;
  - add `stages` to `SceneEventPayload` and drop its `provider` and `attempts`;
  - add `stages` to the phase entry.

  Update every test fixture.
- [ ] 6.2 Write failing tests in `test/components.test.tsx`:
  - expanded scene details show `Image: Fal.ai (fal-ai/flux/dev), 2 attempts` and `Clip: RunningHub (minimax/hailuo-h3), 1 attempt` under the names `Scene {n} image diagnostics` and `Scene {n} clip diagnostics`;
  - "1 attempt" is singular;
  - an absent stage is not listed.
- [ ] 6.3 Write failing tests for the phase sections:
  - the Decomposition section lists `Timestamps` then `Scene instructions`;
  - the Final video section lists `Assembly: Local assembly (ffmpeg), 1 attempt`;
  - an empty list renders nothing;
  - a new snapshot updates a count without a reload.
- [ ] 6.4 Implement the shared formatter (`formatStageDiagnostic`, one place for the label and the pluralization), the `SceneRow.tsx` rows and the `PhaseSection.tsx` list; make 6.2-6.3 pass.

## 7. Review and Update Existing Unit Tests (MANDATORY)

- [ ] 7.1 Review backend and frontend tests that read or set the scene's `provider` or `attempts` on the payload (for example, the `components.test.tsx` fixture), and update them to `stages`. Tests that read `scenes.attempts` in the store are unaffected, because the column stays.
- [ ] 7.2 Confirm every scenario in `specs/stage-diagnostics/spec.md` has at least one test, and map ticket AC1-AC4 to tests; list both in the step 8 report.
- [ ] 7.3 Confirm module test coverage has not decreased (compare against this change's propose commit).

## 8. Run Unit Tests and Verify Database State (MANDATORY)

- [ ] 8.1 Capture the pre-test baseline of the default store: row counts per table (including `stage_attempts` and `provider_requests`), applied migrations, trigger list, and `data/projects/` contents.
- [ ] 8.2 Run the targeted tests: `stage-diagnostics`, `scene-registration-session`, `phase-progress`, `scene-api-surface`, `session-api-surface`, `components`.
- [ ] 8.3 Run `npm run typecheck` and the full `npm test` in both `backend` and `frontend`. Run the backend suite once more in a fresh worktree without `backend/.secrets.json`, so local credentials cannot mask a failure or a leak test.
- [ ] 8.4 Verify the post-test state matches the baseline; restore it if not.
- [ ] 8.5 Create the report `openspec/changes/see-provider-and-attempts/reports/YYYY-MM-DD-step-8-unit-test-and-db-verification.md`.
- [ ] 8.6 Mark this step complete only after the tests pass and the report file exists.

## 9. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [ ] 9.1 Start the real server on a scratch store and scratch projects folder, with stub providers; confirm `GET /health`.
- [ ] 9.2 Create a session and drive a scene through image and clip (stub). Then `curl GET /sessions/:id` and check:
  - `stages.image` and `stages.video` show provider and attempts;
  - there is no top-level `provider` or `attempts`.
- [ ] 9.3 Insert `timestamps`, `instructions` and `assembly` attempt rows with sentinel error text in the scratch store, then `curl GET /sessions/:id` and check:
  - the phase `stages` are correct;
  - `grep` finds no sentinel and no endpoint path in the body.
- [ ] 9.4 Error case: `curl GET /sessions/<unknown>` still answers 404. `curl GET /docs/json` documents `stages` and no longer documents the scene's `provider` or `attempts`.
- [ ] 9.5 Clean up the scratch store and folder; confirm the default store is untouched; save `openspec/changes/see-provider-and-attempts/reports/YYYY-MM-DD-step-9-manual-endpoint-testing.md`.

## 10. E2E Testing with Playwright MCP (MANDATORY if applicable - AGENT MUST EXECUTE)

- [ ] 10.1 Decide applicability: scene details and phase sections change, so it applies.
- [ ] 10.2 Run backend (scratch store, stub providers) and frontend. Open a session and expand a scene: the image and clip diagnostics appear under their accessible names.
- [ ] 10.3 Trigger a transient image failure followed by a success; confirm the image attempt count rises without a reload.
- [ ] 10.4 With session-level attempt rows prepared, confirm the Decomposition and Final video sections list their stages. Confirm that no error text, request id or endpoint path is visible anywhere on the page.
- [ ] 10.5 Restore the environment and save `openspec/changes/see-provider-and-attempts/reports/YYYY-MM-DD-step-10-e2e.md`.

## 11. Update Technical Documentation (MANDATORY)

- [ ] 11.1 `docs/api-spec.yml`: regenerate from `GET /docs/json`. Confirm the changes are exactly: scene `stages` added, scene `provider` and `attempts` removed, and phase `stages` added.
- [ ] 11.2 `docs/data-model.md`:
  - add `instructions` to the `stage_attempts.stage` values;
  - record that diagnostics are derived from `stage_attempts` and `provider_requests` and never stored;
  - note that `scenes.attempts` is the current-cycle attempt number, not a total.
- [ ] 11.3 `docs/backend-standards.md`: record the diagnostics allow-list rule (closed schema with `.strict()`, plus a sentinel leak test for any new diagnostic field), and that every provider identifier needs a display entry in `stageDiagnostics.ts`.
- [ ] 11.4 `docs/frontend-standards.md`: add the `Scene {n} image diagnostics` and `Scene {n} clip diagnostics` names to the naming table, and record `formatStageDiagnostic` as the one place the diagnostic line is formatted.

## 12. Close out

- [ ] 12.1 Ask the user before commenting on JOS-136 (the voice provider identifier that `stageDiagnostics.ts` maps is `ElevenLabs`) and JOS-184 (a per-cycle breakdown can extend `StageDiagnostic`).
- [ ] 12.2 Ask before pushing. Open the PR with a description linking to JOS-166, targeting `feature/entrega-2-JAME` (JOS-168 is merged, so the change is no longer stacked).
- [ ] 12.3 Obtain review by at least one human, not only AI agents.
- [ ] 12.4 Archive the OpenSpec change after merge.
