# Tasks — Adjust the pause after a scene and rebuild the final video (JOS-190)

Every code change starts with a failing test (TDD), and every scenario in `specs/` has at least one test. Backend code uses only erasable TypeScript syntax (no enums, no parameter properties), because the server runs in Node's strip-only mode. Backend tests always run with a scratch `DB_PATH` and `PROJECTS_ROOT`.

## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create branch `feature/jos-190-adjust-scene-pause` with `--no-track` from `origin/feature/entrega-2-JAME` (MVP; integration branch, identical to `main` at `9c78fe0`), in the worktree `../AI4Devs-jos-190`
- [x] 0.2 Verify the branch was created, has no upstream, and is the current branch in that worktree

## 1. Gate

- [x] 1.1 `git fetch`; confirm the base still matches design.md § Context:
  - `runAssemblyAttempt` maps stored intervals to clips and refuses when `finalVideoPath` is set;
  - the ffmpeg adapter muxes with `-c:a copy`;
  - interval, duration and speed-factor columns have lock triggers;
  - `sentenceSpeechSpans` is exported.
  Record the result here; if anything moved, update design.md before coding.

  Result: all four hold; entrega had not moved (0 commits behind). See the step 1 report § 1.1.
- [x] 1.2 Spike (design Decision 5), recorded in `reports/2026-10-15-step-1-narration-edit-spike.md`:
  - on the committed JOS-182 fixture and on one real voice-over, cut 1.5 s and insert 1.0 s of silence at pause midpoints with the `atrim`/`anullsrc`/`concat` → AAC path;
  - measure with `ffprobe` (`nb_frames`, stream durations) that audio and video agree within ±1 frame at each cut and at the end.
  If they do not, switch Decision 5 to the MP3 frame-snapped splice and update design.md before coding.

  Result: passes. Edited narration within 1 ms of expected, audio-vs-video 12.7 ms (baseline 12.1 ms), error constant with 20 cuts. Done on `say`-synthesized speech encoded to MP3 rather than a real voice-over (none available); Decision 5 (AAC) stands.
- [x] 1.3 Measure, on the same real session, the derived pause of every scene (Decision 1). Record the largest pause and how many scenes the speed-factor clamp would narrow, to confirm the range rule on real data.

  Result: no real session or ElevenLabs audio is available (no credential, no stored audio), so this uses JOS-142's recorded survey of real narration: 26 pauses, 0.04-1.26 s; the clamp binds on none. See the step 1 report § 1.3.

## 2. Backend: pause derivation and range (TDD; design Decisions 1-2)

- [x] 2.1 Write failing unit tests in a new `backend/test/scene-pause.test.ts` for `derivePauses(script, scenes, characters, mp3Duration)`:
  - a pause between two scenes;
  - the last scene runs to the MP3's end;
  - a scene with no `PROMPT`, and timestamps that do not match the script, yield no pause instead of an error.
- [x] 2.2 Write failing tests for `pauseRange(clipSeconds, speechSeconds, originalPause)`:
  - the comfortable case (0.2-3.0);
  - a floor raised by the speed factor (`C`=8, `S`=3.0 → 1.0);
  - a ceiling lowered by the speed factor;
  - an original above 3.0 s widens the cap;
  - an original already outside the limit is included;
  - `limitedBySpeedFactor`;
  - grid membership (1.1 allowed, 1.05 refused, the off-grid original allowed).
- [x] 2.3 Implement both as pure functions in `backend/src/scenePause.ts`, reusing `sentenceSpeechSpans`; make 2.1-2.2 pass.

## 3. Backend: effective intervals (TDD; design Decision 4)

- [x] 3.1 Write failing tests for `applyPauseEdits(intervals, pauses, mp3Duration)`:
  - no edits returns the stored intervals unchanged;
  - a trim shortens that scene and shifts every later one;
  - an extension lengthens and shifts;
  - several edits accumulate;
  - the result passes the shared partition check against the edited duration;
  - `edits` carry the original-timeline midpoints and deltas.
- [x] 3.2 Implement it in `scenePause.ts`; make 3.1 pass.

  Result: the partition rule moved out of `sceneRegistration.ts` into a pure `intervalPartition.ts` (`findIntervalPartitionProblem`, same messages) that both call, because importing the private function would have pulled `db`/`orchestrator` into the pause module and created an import cycle. The 124 existing registration/interval tests still pass.

## 4. Backend: storage (TDD; design Decision 3)

- [ ] 4.1 Write failing tests:
  - `scene_pause_edits` set, replace and delete-on-original;
  - `final_video_builds` insert, with its no-update/no-delete triggers refusing changes;
  - the compare-and-set of `runs.final_video_path` refuses a stale expected path;
  - storing an edit never changes a scene's interval, requested duration or speed factor (the lock triggers still fire).
- [ ] 4.2 Add the migrations and repository functions in `db.ts`; make 4.1 pass. Existing migration and lock tests still pass.

## 5. Backend: narration edits in the assembly tool (TDD; design Decision 5)

- [ ] 5.1 Write failing tests:
  - the stub assembly tool records `narrationEdits`;
  - the ffmpeg adapter, given no edits, issues exactly today's arguments (`-c:a copy`);
  - given edits, it builds the cut/insert filtergraph and AAC encode;
  - an output whose audio and video durations differ by more than one frame is reported as a failure.
  The real-ffmpeg test uses the committed fixture and runs where `ffmpeg` is present, like the existing adapter tests.
- [ ] 5.2 Extend `AssemblyInput`, `ffmpegAssemblyTool.ts` and `stubAssemblyTool.ts`; make 5.1 pass.

## 6. Backend: rebuild lifecycle (TDD; design Decisions 6-8)

- [ ] 6.1 Write failing tests through the store and the assembly stub:
  - a rebuild runs a fresh cycle;
  - it passes the shifted intervals and edits to the tool;
  - on success it writes `final-video-2.mp4`, keeps `final-video.mp4`, records the build with its edits, and moves `final_video_path`;
  - a second rebuild writes version 3.
- [ ] 6.2 Write failing tests for failure and state:
  - a failed rebuild leaves the previous version current, sets no `runs.failure`, and exposes `rebuildFailure`;
  - while a rebuild runs the state is `final-video-generating`, the assembly phase is in progress, and `finalVideoUrl` stays set;
  - a paused session holds the rebuild until continue.
- [ ] 6.3 Write failing restart tests: an in-flight rebuild at boot is settled as a failed attempt, the current version is unchanged, and nothing is relaunched.
- [ ] 6.4 Implement the rebuild mode in `runAssemblyAttempt`, the launcher entry, `rebuildInFlight` in `deriveSessionState`, and the restart settlement; make 6.1-6.3 pass.

## 7. Backend: API and read (TDD; design Decision 9)

- [ ] 7.1 Write failing tests in `backend/test/scene-pause-api.test.ts` for `PUT /sessions/:sessionId/scenes/:sceneId/pause`:
  - 200 with the updated scene;
  - 422 off-grid and out of range (sentence names the range and the clamp reason);
  - 409 with no final video, during an assembly, and for a scene with no pause;
  - 404 for an unknown session or scene;
  - a live snapshot is broadcast.
- [ ] 7.2 Write failing tests for `POST /sessions/:sessionId/final-video/rebuild`: 202, 409 `no-final-video`, `assembly-in-progress` and `nothing-to-rebuild`, 404.
- [ ] 7.3 Write failing tests for the read:
  - `scene.pause` appears only with a final video and a derivable pause;
  - `session.finalVideo` carries `version`, `pendingPauseEdits` and `rebuildFailure`;
  - the generated OpenAPI documents both routes and the new fields.
- [ ] 7.4 Implement the routes with Zod schemas and the read fields; make 7.1-7.3 pass.

## 8. Frontend (TDD; design Decision 10)

- [ ] 8.1 Add `pause` and `finalVideo` to `types.ts` and the test fixtures; add `setScenePause` and `rebuildFinalVideo` to `api/client.ts`.
- [ ] 8.2 Write failing tests for the scene card:
  - `Pause after scene {n}` appears only when `pause` is present, with the read's min, max and value;
  - leaving the field saves the value;
  - `Reset scene {n} pause` is enabled only when the value differs and restores the original;
  - the clamp sentence appears when `limitedBySpeedFactor`;
  - a refusal shows as a status sentence.
- [ ] 8.3 Write failing tests for the Final video section:
  - "Version N";
  - `Rebuild final video` only when edits are pending;
  - the download stays during a rebuild;
  - a failed rebuild shows its cause and keeps the button.
- [ ] 8.4 Implement in `SceneRow.tsx` and `FinalVideoDownload.tsx` with the existing tokens and Studio styling; make 8.2-8.3 pass. The "Accessible naming convention" suite passes with only the three new names added.

## 9. Review and Update Existing Unit Tests (MANDATORY)

- [ ] 9.1 Review tests that assert the exact session or scene payload shape, the assembly arguments, `final-video.mp4` as the only file, or "assembly refuses when a final video exists"; update only where this change's specs require it.
- [ ] 9.2 Confirm every scenario in `specs/` has at least one test, and map each to its tests in the step 10 report.
- [ ] 9.3 Confirm module test coverage has not decreased (compare against this change's propose commit).

## 10. Run Unit Tests and Verify Database State (MANDATORY)

- [ ] 10.1 Capture the pre-test baseline of the default store (row counts per table, applied migrations, triggers) and `data/projects/`.
- [ ] 10.2 Run the targeted tests (`scene-pause`, `scene-pause-api`, the assembly and restart tests, `components`).
- [ ] 10.3 Run `npm run typecheck` and the full `npm test` in `backend` and `frontend` (backend with scratch `DB_PATH`/`PROJECTS_ROOT`). Run the backend suite once more in a fresh worktree without `backend/.secrets.json`.
- [ ] 10.4 Verify the post-test state matches the baseline; restore it if not.
- [ ] 10.5 Create `openspec/changes/adjust-scene-pause/reports/YYYY-MM-DD-step-10-unit-test-and-db-verification.md`.
- [ ] 10.6 Mark this step complete only after the tests pass and the report file exists.

## 11. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [ ] 11.1 Start the real server on a scratch store and projects folder, with `USE_STUB_ASSEMBLY_TOOL` unset so the real ffmpeg adapter runs; reach a session with a final video (test endpoints plus the real assembly).
- [ ] 11.2 `curl` the pause route: a valid trim (200), off-grid (422), out of range (422 with the clamp sentence), during an assembly (409), unknown scene (404).
- [ ] 11.3 `curl` the rebuild: 202, then `GET` the session until version 2. Check that the project folder holds `final-video.mp4` and `final-video-2.mp4`, and `ffprobe` the new file for duration and sync. Then `nothing-to-rebuild` (409). Check that `GET /docs/json` documents both routes.
- [ ] 11.4 Clean up the scratch store and folder; confirm the default store is untouched; save `reports/YYYY-MM-DD-step-11-manual-endpoint-testing.md`.

## 12. E2E Testing with Playwright MCP (MANDATORY if applicable - AGENT MUST EXECUTE)

- [ ] 12.1 Applies: the session page gains a field and an action. Run the backend (scratch store, real assembly) and the frontend.
- [ ] 12.2 On a session with a final video, expand a scene by name, set `Pause after scene {n}`, leave the field, and confirm the saved value and `Reset scene {n} pause`.
- [ ] 12.3 Click `Rebuild final video`. Confirm the download stays during the rebuild, the section reaches "Version 2" without a reload, and the new file downloads.
- [ ] 12.4 Force a refusal (an off-grid value) and confirm the sentence; reset a scene and confirm `Rebuild final video` disappears when nothing is pending.
- [ ] 12.5 Restore the environment; save `reports/YYYY-MM-DD-step-12-e2e.md` with screenshots.

## 13. Update Technical Documentation (MANDATORY)

- [ ] 13.1 `docs/api-spec.yml`: regenerate from `GET /docs/json`; confirm the only changes are the two routes and the new read fields.
- [ ] 13.2 `docs/data-model.md`: the two tables, which one is mutable and why, the implicit version 1, and that pauses and effective intervals are derived.
- [ ] 13.3 `docs/adr/0005-media-assembly.md`: a dated amendment to Decision 4b (stream copy unless the User edited pauses; edited builds encode once and are verified within ±1 frame), with the spike's numbers.
- [ ] 13.4 `docs/PRD.md` §7.3: the pause dial after the final video, its range, and versioned final-video files. `docs/frontend-standards.md`: the three new accessible names.
- [ ] 13.5 Run `graphify update .`.

## 14. Close out

- [ ] 14.1 Commit the work on `feature/jos-190-adjust-scene-pause`, path-scoped to this change.
- [ ] 14.2 Ask before pushing (explicit `git push -u origin feature/jos-190-adjust-scene-pause`, never a bare push); open the PR against `feature/entrega-2-JAME` with a description linking to JOS-190.
- [ ] 14.3 Obtain review by at least one human, not only AI agents.
- [ ] 14.4 Archive the OpenSpec change after merge.
