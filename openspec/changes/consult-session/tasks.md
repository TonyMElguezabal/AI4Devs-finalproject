# Tasks — Consult a session by its identifier

Group 1 is a hard gate: the foundations this story stands on must have landed before any code is written. Tests come first throughout: each behaviour gets a failing test before the code that satisfies it, and every requirement scenario has at least one functional test.

## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create feature branch `feature/jos-135-consult-session` — from `feature/jos-134-start-video-project`, not `main`: this story directly extends that story's real `backend/`/`frontend/` code (its PR, #2, is not yet merged), same precedent as every other branch this session
- [x] 0.2 Verify branch creation and current branch status — confirmed via `git branch --show-current`: `feature/jos-135-consult-session`

## 1. Gate: Confirm the foundations

- [x] 1.1 Confirm `start-video-project` (JOS-134) has landed and sessions can be registered — confirmed: `backend/`/`frontend/` exist, `POST /sessions` registers real sessions (this branch)
- [x] 1.2 Confirm `define-backend-stack` (JOS-179) has landed — confirmed: `docs/backend-standards.md` full rewrite, archived
- [x] 1.3 Confirm `define-persistence` (JOS-181) has landed — confirmed: `docs/data-model.md` full rewrite, archived
- [x] 1.4 Confirm `define-frontend-stack` (JOS-180) has landed — confirmed: `docs/frontend-standards.md` full rewrite, archived
- [x] 1.5 Confirm `define-live-updates` (JOS-183) has landed; locate the session and scene payload shapes and the snapshot-read contract (Decision 1) — confirmed: `SessionEventPayload`/`SceneEventPayload`/`SessionSnapshot` in `backend/src/types.ts`, already the live wire contract `toSnapshot()` produces
- [x] 1.6 If any of the above is missing, stop and record the blocker rather than building against a guess — nothing missing; proceeding

## 2. Backend: data access scoped by session (TDD)

- [x] 2.1 Write a failing test that two sessions with the same title each return only their own scenes — `backend/test/session-consultation.test.ts` (passed immediately: `getScenesForRun(runId)` already scoped correctly, inherited from the skeleton)
- [x] 2.2 Write a failing test that two sessions each with a scene ID 1 return only their own scene 1 — confirmed failing first (`getSceneForRun is not a function`)
- [x] 2.3 Write a failing test that a file reference resolving outside the session's project folder is refused — confirmed failing first (no guard existed)
- [x] 2.4 Implement repository reads that require the session identifier, keyed by `(sessionId, sceneId)` (Decision 2) — new `getSceneForRun(runId, sceneId)` in `db.ts`; also used to fix a **real pre-existing bug** in the per-scene download route: its inline params schema validated `sessionId` as a UUID (from before ULIDs existed), rejecting every real session id with a 400 before the handler ran, and its ownership check was a manual inline comparison rather than a scoped repository call
- [x] 2.5 Implement file-reference resolution against the session's recorded folder, refusing paths outside it — `assertWithinProjectFolder()` in `db.ts`, used by both `writeArtefact` and `resolveArtefactPath`
- [x] 2.6 Run the group 2 tests and confirm they pass — 3/3 (full suite 36/36)

## 3. Backend: the session read (TDD)

- [x] 3.1 Write a failing test that `GET /api/sessions/{sessionId}` returns title, script, language, state, paused marker, creation time and scenes — `backend/test/session-read.test.ts`; confirmed failing first (`createdAt` was entirely absent from the wire contract)
- [x] 3.2 Write a failing test that the returned script is identical to the stored script — passed immediately (already correct from `start-video-project`)
- [x] 3.3 Write a failing test that a session with no scenes returns an empty scene list, not an error — passed immediately
- [x] 3.4 Write a failing test that scenes are returned in ascending identifier order when they completed out of order (Decision 3) — passed immediately (`getScenesForRun`'s `ORDER BY idx ASC` already correct)
- [x] 3.5 Write failing tests that an unknown identifier and a malformed identifier both return the not-found response, with no other session's data (Decision 4) — unknown-id case passed immediately; **malformed-id case confirmed failing first** (400, not 404 — the strict ULID param schema rejected it before the handler could apply Decision 4's "look the same" rule)
- [x] 3.6 Write a failing test that no MP3, timestamp or generated-text path or content appears in the response (Decision 7) — passed immediately (those fields were never added)
- [x] 3.7 Write a failing test that the request needs no credential or authentication header — passed immediately (no auth layer exists, per PRD §12.3)
- [x] 3.8 Write a failing test that a session with an old creation time is returned normally (§12.2) — confirmed failing first (same missing-`createdAt` gap as 3.1)
- [x] 3.9 Write a failing test that the session and scene fields match the payload shapes from `define-live-updates` (Decision 1) — confirmed failing first (missing `createdAt` key)
- [x] 3.10 Implement the read, reusing the payload shapes from JOS-183 rather than restating them — added `createdAt` to `SessionEventPayload` (`types.ts`), `toSnapshot()` (`orchestrator.ts`), and `sessionResponseSchema` (`routes.ts`) — one field added to the one shared shape, not a second representation
- [x] 3.11 Validate the identifier on the way in and the representation on the way out (Decision 8) — response validation already existed (Zod `response` schema, unchanged); **request-side validation deliberately loosened** for this one route (plain string, not the strict ULID schema) so Decision 4's "malformed looks like unknown" can be enforced in the handler rather than pre-empted by framework-level 400s — the exact fix for 3.5
- [x] 3.12 Run the group 3 tests and confirm they pass — 11/11 (full suite 47/47)

## 4. Frontend: the session page (TDD)

- [x] 4.1 Write failing component tests that the page shows title, script, state and the available results for a session — new `SessionPage` component + `test/components.test.tsx` describe block; confirmed failing first (module didn't exist)
- [x] 4.2 Write a failing component test that a session with no scenes shows "not yet available" rather than an error (Decision 6) — implemented in `SceneList` (applies everywhere it's used, not just this page) since that's the one place "the list" concern lives
- [x] 4.3 Write a failing component test that scenes render in the order received — passed once `SessionPage` existed (delegates to `SceneList`'s existing ordering guarantee)
- [x] 4.4 Write a failing component test that the not-found state is shown with a way to start a new project — required a real architectural fix, not just UI: `useLiveSession` only ever called `fetchSnapshot` from the SSE stream's `onopen`, so an unknown session (whose `/events` request the backend rejects with 404 before upgrading) never opened, never fetched, and never surfaced anything — the page would show "connecting…" forever. Fixed by distinguishing a *permanent* stream failure (`readyState === CLOSED`, no browser auto-retry — what a non-200 response produces) from an *ordinary* drop after a prior successful connection, without adding a second `fetchSnapshot` call that would have broken `useLiveSession.test.tsx`'s existing resync-call-counting assertions (2 new tests added there instead, the 4 original ones left untouched and still passing)
- [x] 4.5 Add the session page at an address containing the identifier (Decision 5) — kept the existing `?sessionId=` query-string address (bookmarkable, already satisfies "contains the identifier") rather than introducing a client-side router for a single conceptual page — `docs/frontend-standards.md`'s "no router until a second real route exists" still holds, since this isn't a second route, just the same address scheme formalised as `SessionPage`
- [x] 4.6 Change the start form so a successful registration navigates to the session page — unchanged, already correct from `start-video-project`
- [x] 4.7 Load through the session read and expose one seam for US-18 to attach live updates, without subscribing here — `SessionPage` is purely presentational (props in, JSX out); `useLiveSession` remains the one seam, now also returning `notFound`
- [x] 4.8 Apply the accessible naming convention from the frontend standards to every region, heading and message — `Session`, `Session not found`, `Start a new project` follow the existing convention's pattern (plain, descriptive, no test-only attributes)
- [x] 4.9 Run the group 4 tests and confirm they pass — 4/4 new `SessionPage` tests + 2/2 new `useLiveSession` tests (full frontend suite 39/39)

## 5. Review and Update Existing Unit Tests (MANDATORY)

- [x] 5.1 Update `start-video-project` tests that assert the identifier is only displayed, to cover the navigation to the session page — **none existed to update**: `start-video-project` never had a unit test asserting App.tsx's rendering (that story's own verification was E2E-only, per its report); no automated test needed changing, only `App.tsx`'s own rendering (now `SessionPage`)
- [x] 5.2 Update `generate-voice-over` tests that stubbed the session read, to use the real read — **not applicable**: `generate-voice-over` (JOS-136) has not been implemented at all yet (0/82 tasks) — no such tests exist in code to update
- [x] 5.3 Confirm every scenario in `specs/session-consultation/spec.md` has at least one functional test — confirmed for all 8 requirements/20 scenarios; one real gap found and closed: the "file of one session requested through another" scenario had no HTTP-boundary test (only the underlying `getSceneForRun` repository test) — added to `session-read.test.ts`
- [x] 5.4 Confirm module test coverage has not decreased — backend 36 → 48 tests (2 new files), frontend 33 → 39 tests; no existing test removed or weakened

## 6. Run Unit Tests and Verify Database State (MANDATORY)

- [x] 6.1 Capture the pre-test state of the store (session and scene counts) and project folders on disk — 0 runs, 0 scenes, 1 pre-existing folder in `data/projects` (real store, `data/skeleton.sqlite`)
- [x] 6.2 Run the targeted tests for this module and capture the pass/fail summary — 15/15 (`session-read.test.ts` + `session-consultation.test.ts`), isolated via `DB_PATH=data/test.sqlite PROJECTS_ROOT=data/test-projects`
- [x] 6.3 Run the full suite and record totals, failures and runtime — 48/48 passed, 2.08s, 0 failures
- [x] 6.4 Verify the post-test state matches the baseline, restoring the store and removing test folders if needed — real store unchanged (0/0/1, byte-identical to baseline); `data/test.sqlite`(+`-shm`/`-wal`) and `data/test-projects/` removed and confirmed absent
- [x] 6.5 Create the report `openspec/changes/consult-session/reports/YYYY-MM-DD-step-6-unit-test-and-db-verification.md` with commands executed, results, pre/post comparison and cleanup actions — `reports/2026-09-26-step-6-unit-test-and-db-verification.md`
- [x] 6.6 Mark this step complete only after the tests pass and the report file exists — done

## 7. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 7.1 Start the backend and confirm it is reachable — `PORT=3101` with isolated `DB_PATH`/`PROJECTS_ROOT`, `GET /` → 200
- [x] 7.2 Capture the pre-test session count — 0 (isolated store)
- [x] 7.3 Create two sessions with the same title through the start endpoint — "Curl Twin" ×2, different scripts/languages
- [x] 7.4 GET each by identifier; verify status, fields, byte-identical script, and that each returns only its own data — both 200, byte-identical scripts, no cross-contamination
- [x] 7.5 GET an unknown identifier and a malformed one; verify both return the not-found response with no other session's data — both 404 `{"error":"session not found"}`, identical shape
- [x] 7.6 Verify the response contains no MP3, timestamp or generated-text path — confirmed, session keys checked against the forbidden-fields list
- [x] 7.7 Verify no authentication header is required — no `Authorization` header sent in any call; all succeeded/behaved correctly
- [x] 7.8 Delete the sessions created above and confirm the store matches its pre-test state — deleted from isolated store, real store re-verified unchanged (0 runs, 1 pre-existing folder, both before and after)
- [x] 7.9 Save the transcript as `openspec/changes/consult-session/reports/YYYY-MM-DD-step-7-curl-endpoint-testing.md` — `reports/2026-09-26-step-7-curl-endpoint-testing.md`

## 8. E2E Testing with Playwright MCP (MANDATORY - AGENT MUST EXECUTE)

- [x] 8.1 Ensure backend and frontend are running from their documented commands — `npm start` (3100), `npm run dev` (5173), both reachable
- [x] 8.2 Start a project through the form and assert the browser lands on the session page for its identifier — landed on `?sessionId=01M3FSQPE1T8QETN4ZK5M95A7Y`
- [x] 8.3 Assert the title, the script and the current state are shown — "E2E Twin", script verbatim, "Session state: submitted"
- [x] 8.4 Reopen the same address in a new page and assert the same session is shown — confirmed identical in a fresh tab
- [x] 8.5 Start a second project with the same title and assert each page shows only its own session — two "E2E Twin" sessions, each showed only its own script, no cross-contamination
- [x] 8.6 Open the page for an unknown identifier and assert the not-found message and the way to start a new project — "No session was found for this identifier." + "Start a new project" button, which cleared back to the empty form
- [x] 8.7 Confirm every interaction located its target through the accessibility tree, with no test-only selectors — all via `read_page`/accessible name, no `data-testid` or CSS hook used
- [x] 8.8 Delete the sessions created, restore the environment, and save the report as `openspec/changes/consult-session/reports/YYYY-MM-DD-step-8-e2e-playwright.md` — sessions deleted, project folders removed, both servers stopped, real store verified back at baseline (0 runs, 1 pre-existing folder) — `reports/2026-09-26-step-8-e2e-playwright.md`

## 9. Update Technical Documentation (MANDATORY)

- [x] 9.1 Add `GET /api/sessions/{sessionId}` to `docs/api-spec.yml` with the session and scene schemas and the not-found response, and confirm it matches what the implementation returns — regenerated from a running instance (`GET /docs/json`), per this file's own "never hand-written" rule; found and fixed two real drifts: the loosened `sessionId` param (no ULID pattern, Decision 8) on this one route, missing `createdAt` on the session schema (both places it appears), and the download route's `sessionId` param still documented as `format: uuid` (the pre-existing bug this story fixed in code, group 2)
- [x] 9.2 Record in `docs/backend-standards.md` that every data-access method takes the session identifier, and that file references are resolved against the session folder — added under § Persistence (Decision 2 bullet) and § API and OpenAPI Conventions (malformed-vs-unknown 404 exception)
- [x] 9.3 Record the session page route in `docs/frontend-standards.md` — new "The session page's address" subsection (Decision 5), plus updated the live-update seam's contract and responsibilities to include `notFound` (task 4.4), which had drifted out of date
- [x] 9.4 Confirm `docs/data-model.md` states that scenes are keyed by session and scene identifier — added a "Keying at the read boundary" note under Scene (Decision 2)

## 10. Close out

- [x] 10.1 Record the missing project-list screen as a product question for the owner (design open question 1) — already recorded in `design.md` § Open Questions #1 (a product gap, not this story's to resolve; identifier-based access is bookmarkable meanwhile) and cross-referenced in `docs/frontend-standards.md` § Not Yet Decided
- [x] 10.2 Record for US-18 where the live-update seam on the session page lives — `useLiveSession(sessionId)` remains the one seam (task 4.7); documented in `docs/frontend-standards.md` § Architecture: The Live-Update Seam, now including the `notFound` responsibility this story added
- [ ] 10.3 Open the PR with a description linking to JOS-135 — **awaiting explicit user go-ahead**
- [ ] 10.4 Obtain review by at least one human, not only AI agents — **awaiting explicit user go-ahead**
- [ ] 10.5 Archive the OpenSpec change after merge — **awaiting explicit user go-ahead**
