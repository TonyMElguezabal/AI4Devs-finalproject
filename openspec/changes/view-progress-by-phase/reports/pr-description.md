## Summary

- Implements US-18 (JOS-168), "View progress by phase": the session page now shows one section per phase (Voice-over, Decomposition, Scenes, Final video), each with its status, held work and, when failed, its cause.
- The session read and the live snapshot carry `session.phases`: four entries in pipeline order, derived on every read from the session state, the recorded failure and the held work. Nothing is stored and there is no migration.
- A retried phase now reads in progress: with no scenes and a recorded failure, an in-flight attempt of that phase's stage queued at or after the failure derives `voice-over-generating` or `chunk-decomposing`. The failure stays recorded until the retry succeeds.
- `phaseActions` is the single place phase actions are derived. It offers none today, because no retry endpoint exists for voice-over, decomposition or assembly; US-23 to US-27 extend it.

## Things to know when reviewing

- Assembly can show `failed` only once some story derives `failedPhase: "assembly"`; the section, its alert and the mapping are in place and tested with a fixture.
- A held decomposition cannot occur on a real server yet, because only the image, video and assembly stages register a launcher. The mapping is unit-tested; the curl and browser checks used a held image scene (see the step 9 report).
- The scenes-phase test of a scene retry only pins existing behaviour; it passed on first run.
- Overlaps with open PRs: #26 (JOS-136) checks the failure before the retry state, so its failure-first check must be reordered when it merges; #27 (JOS-184) adds the `scheduled` attempt outcome, which `isRetryInFlight` should be rechecked against.
- `docs/api-spec.yml` was regenerated from the running routes; the only structural change is `phases`, plus wording the generator now emits differently (see the note at the top of the file).

## Test plan

- [x] Backend: 921 passed, 2 skipped; `tsc` clean. Also run in a fresh worktree without `backend/.secrets.json`.
- [x] Frontend: 78 passed; `tsc` clean.
- [x] curl on a scratch store: `phases` in order, decomposition failure with cause, retry in flight, held scene, 404 cases, OpenAPI (step 9 report).
- [x] Browser run with `playwright-cli`: sections in order, live update without reload, failure then retry, held text (step 10 report).
- [x] Default store unchanged after every step.
- [ ] Human review.

Reports: `openspec/changes/view-progress-by-phase/reports/`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_011t4AfcPhpwACq5vPq8NLrM
