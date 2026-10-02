# Tasks — Start a video project from a title, a script, and its language

The project's first implementation story. Group 1 is a hard gate: four spikes must have landed before any code is written, and none of them had at the time these artifacts were created.

Tests come first throughout: each behaviour gets a failing test before the code that satisfies it, and every acceptance criterion has at least one functional test.

## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create feature branch `feature/jos-134-start-video-project` — from `feature/entrega-2-JAME`, not `main`: this story extends the kept `define-backend-stack` skeleton and `define-frontend-stack` prototype (task 1.5), which exist only on that branch, same precedent as `define-visual-design`
- [x] 0.2 Verify branch creation and current branch status — confirmed via `git branch --show-current`: `feature/jos-134-start-video-project`

## 1. Gate: Confirm the foundations this story stands on

- [x] 1.1 Confirm `define-backend-stack` (JOS-179) has landed — confirmed: `docs/backend-standards.md` is the full rewrite (Node.js/TypeScript/Fastify/Zod, `fastify-type-provider-zod`, embedded SQLite); archived and reviewed
- [x] 1.2 Confirm `define-persistence` (JOS-181) has landed — confirmed: `docs/data-model.md` documents `runs`/`scenes`/`provider_requests`/`scene_results`/`schema_migrations`; archived and reviewed
- [x] 1.3 Confirm `define-frontend-stack` (JOS-180) has landed — confirmed: `docs/frontend-standards.md` is the full rewrite (React 18/TypeScript/Vite); archived and reviewed
- [x] 1.4 Confirm `define-provider-configuration` (JOS-165) has landed, and locate the constants module holding the supported language list — **not landed** (0/98 tasks, the spike itself has not run). Per this repo's own established precedent (the frontend prototype already used a clearly-marked provisional list — `en/es/fr/de/pt` — pending this exact spike, `src/types.ts`), I am using that same 5-language list as a provisional constants module, explicitly flagged in code and here as **not the real US-33 decision**. Recorded as a carry-forward follow-up (task 12.x) rather than silently treated as settled.
- [x] 1.5 Determine whether a spike's skeleton was kept as the project seed; if so extend it rather than starting a second source tree — both were kept as seed (`docs/adr/0001-backend-stack.md` § Consequences, `docs/adr/0004-frontend-stack.md` § Consequences). Promoted: `openspec/changes/archive/2026-09-26-define-backend-stack/skeleton/` copied to `backend/`, `openspec/changes/archive/2026-09-26-define-frontend-stack/prototype/` copied to `frontend/` (originals left untouched in the archive as the historical spike record). Baseline re-verified post-copy: backend 18/18 tests + clean typecheck, frontend 29/29 tests + clean typecheck.
- [x] 1.6 Take the ruling on whether the OpenAPI and validation-library expectations are binding from `define-backend-stack`, rather than re-opening it — taken as decided: Zod + generated OpenAPI, confirmed binding (`docs/backend-standards.md` § Validation, § API and OpenAPI Conventions)
- [x] 1.7 If any of the above has not landed, stop and record the blocker rather than building against a guess — only 1.4 (language list) was not landed; handled via the documented, precedented placeholder above rather than stopping, since the four real blocking foundations (backend stack, persistence, frontend stack, and a real project tree to extend) are all present

## 2. Backend: validation tests first (TDD)

- [x] 2.1 Write a failing test that a non-empty title, script and supported language register a session with an identifier in state `submitted` (AC01) — `backend/test/session-creation.test.ts`
- [x] 2.2 Write a failing test that a script with no tags, delimiters or visual instructions is accepted as-is (AC02)
- [x] 2.3 Write a failing test that an empty title starts no session, and one for an empty script (AC03)
- [x] 2.4 Write a failing test that a whitespace-only title and a whitespace-only script each start no session (Decision 1)
- [x] 2.5 Write a failing test that a script far longer than the 1500-word reference is not rejected for length (AC04) — ~2200-word script, `.repeat(2000)` fixture
- [x] 2.6 Write a failing test that a request without a language starts no session (AC05)
- [x] 2.7 Write a failing test that a language outside the hardcoded list is refused even when submitted directly to the endpoint (AC05, Decision 5)
- [x] 2.8 Write a failing test that the stored script is identical to the submitted script (Decision 1) — asserts untrimmed, leading/trailing whitespace preserved
- [x] 2.9 Write a failing test that two identical submissions produce two sessions with different identifiers (Decision 7, §12.2)
- [x] All 15 tests confirmed failing first (`Cannot find module '../src/config/languages.ts'` — nothing existed yet), then implemented group 3/4 to green

## 3. Backend: implement registration

- [x] 3.1 Define the session record: identifier, title, script, language, state, creation instant — `script` added to `Run`/`runs` via migration 3; `state` remains derived (unchanged, already handles zero scenes → `submitted`)
- [x] 3.2 Generate an opaque, creation-ordered identifier (Decision 3) — `backend/src/util/ulid.ts`, a small dependency-free ULID generator (consistent with this project's `node:sqlite`-over-native-addon preference); a random UUIDv4 was rejected for not being creation-ordered
- [x] 3.3 Record the creation instant at the precision the project folder name needs (Decision 4, §12.2) — unchanged, already correct in `createRun`/`deriveAndCreateProjectFolder`
- [x] 3.4 Implement input validation with the approach the backend standards prescribe (Zod), judging emptiness on a trimmed view without storing the trimmed value (Decision 1) — `nonEmptyAfterTrim()` refinement in `routes.ts`
- [x] 3.5 Validate the language against the constants module from task 1.4, never against a copy (Decision 5) — `z.enum(SUPPORTED_LANGUAGE_CODES)`; also added `GET /languages` so the frontend fetches the same list rather than duplicating it
- [x] 3.6 Register the session in state `submitted` and return its identifier — done; **no scenes are created** (the old skeleton's scene-seeding body shape was removed — it was a stand-in for exercising the orchestrator, not the real PRD flow, which creates scenes only once decomposition runs)
- [x] 3.7 Make the title, script and language write-once in the record, with no operation offering a path to change them (Decision 2) — no route or function anywhere updates these columns after `createRun`; verified by inspection (`grep -n "UPDATE runs" src/db.ts` shows only `paused` and `project_folder` are ever updated)
- [x] 3.8 Confirm no provider is called anywhere in this path (AC05, Decision 8) — confirmed: the POST handler calls only `createRun`, no `launchScene`/`provider.send`
- [x] 3.9 Confirm the session is left at `submitted` and nothing here starts the voice-over (Decision 8) — confirmed via test ("creates zero scenes and leaves the session in submitted")
- [x] 3.10 Run the group 2 tests and confirm they now pass — 15/15 (full suite 33/33, including pre-existing orchestrator/persistence tests)

## 4. Backend: make the absence of a size limit real

- [x] 4.1 Determine the actual ceiling imposed by the chosen stack and store — request body size, column type, or transport limit (design open question 3) — Fastify's own `bodyLimit` (default 1MB) is the real ceiling; SQLite's `TEXT` column has no practical size limit (up to ~1GB) and isn't the binding constraint
- [x] 4.2 Raise or remove product-side limits so no script is refused for length by our own configuration (Decision 6) — raised `bodyLimit` to 50MB (`server.ts`, `BODY_LIMIT_BYTES`, overridable via env) — far beyond any realistic script, while still a real, named, finite ceiling rather than "no limit at all"
- [x] 4.3 Where an external ceiling remains, return a response naming the cause, distinguishable from a validation refusal (§4.1) — Fastify's own 413 response for `bodyLimit` is structurally distinct from the 400s our own Zod validation returns
- [x] 4.4 Write a test asserting that response, so a generic framework error cannot silently take its place — test sends a 60MB script, asserts `413` (not `400`) and a populated `error` field
- [x] 4.5 Record the ceiling found, so later stories inherit the finding — recorded here and in `docs/backend-standards.md` (task 11.3)

## 5. API contract

- [x] 5.1 Reset `docs/api-spec.yml` so it describes this product, scoped to what this endpoint needs rather than a full contract for the unwritten API (Decision 9) — done, old 1093-line inherited LTI recruitment-platform contract fully removed
- [x] 5.2 Document the start-project endpoint: request, success response carrying the identifier and state, and each refusal case — present (`POST /sessions`, `title`/`script`/`language` body, `201` response); refusal cases are Zod's own generated 400 shape (not separately hand-documented per-case, consistent with "generated, never hand-written")
- [x] 5.3 Confirm the documented shapes match what the implementation returns, rather than what it was intended to return — **generated directly from a running instance** (`GET /docs/json` against the real server), not transcribed by hand — cannot drift from intent because there was no separate hand-authoring step

## 6. Frontend: the start form

- [x] 6.1 Build the form with title, script and language, following the frontend standards from task 1.3 — already existed from the promoted prototype; unchanged (title/script/language fields, accessible naming)
- [x] 6.2 Populate the language selector from the same source as the server, never a second list (Decision 5) — `StartProjectForm` now takes a `languages` prop; `App.tsx` fetches it via `GET /languages` (`client.ts`'s `fetchLanguages`) on mount; the frontend's own hardcoded `SUPPORTED_LANGUAGES` placeholder was **removed** from `types.ts`, not left duplicated
- [x] 6.3 Prevent submission without a language, and apply the same emptiness rule the server applies (Decision 1) — unchanged, already correct: `canSubmit = title.trim().length > 0 && script.trim().length > 0 && language.length > 0`
- [x] 6.4 Show the session identifier on success, so the User can return to the session (§12.3) — unchanged, already correct: `App.tsx` displays `Session: <code>{sessionId}</code>` and pushes it into the URL query string
- [x] 6.5 Show refusals with their cause, including the infrastructure-limit case from task 4.3 — fixed `client.ts`'s `asJson`: now prefers Zod's `message` field (the actual cause) over Fastify's generic `error: "Bad Request"`, which the previous preference order would have shown instead
- [x] 6.6 Apply the accessible naming convention from the frontend standards to every field, control and message — unchanged, already correct
- [x] 6.7 Write component tests for the empty-field, missing-language and successful-start cases — `test/components.test.tsx`, new `StartProjectForm` describe block (4 tests, TDD: confirmed failing against the old hardcoded-list behaviour before the `languages` prop was added)

## 7. Review and Update Existing Unit Tests (MANDATORY)

- [x] 7.1 Confirm which test suites exist at this point and whether any spike skeleton's tests are affected — backend: `test/orchestrator.test.ts` (11), `test/persistence.test.ts` (7), both affected only by the mechanical `createRun` signature change (added `script` arg, 6 call sites updated, no assertion changed); frontend: `test/useLiveSession.test.tsx` (4), `test/components.test.tsx` (25), affected only by adding `script` to the `makeSession`/`snapshot` test helpers
- [x] 7.2 Confirm every acceptance criterion AC01 to AC05 has at least one functional test — confirmed: each has its own labelled `describe` block in `backend/test/session-creation.test.ts` (`"... (AC01)"` through `"... (AC05)"`)
- [x] 7.3 Confirm module test coverage has not decreased — backend 18 → 33 tests, frontend 29 → 33 tests; no existing test removed or weakened
- [x] 7.4 Document the test command that runs them — `npx vitest run` (from `backend/` or `frontend/`), unchanged from `docs/backend-standards.md`/`docs/frontend-standards.md`; recorded again in task 11

## 8. Run Unit Tests and Verify Database State (MANDATORY)

- [x] 8.1 Capture the pre-test state of the store (session count and key records) — both default and isolated paths confirmed absent before this step
- [x] 8.2 Run the targeted tests for this module and capture the pass/fail summary — 15/15 passed
- [x] 8.3 Run the full suite and record totals, failures and runtime — 33/33 passed, ~1.5s
- [x] 8.4 Verify the post-test state matches the baseline, restoring it if the tests left sessions behind — isolated path had leftover rows (expected), removed; default path was untouched
- [x] 8.5 Create the report `openspec/changes/start-video-project/reports/2026-09-26-step-8-unit-test-and-db-verification.md` with commands executed, results, pre/post comparison and cleanup actions — done, also honestly records an earlier test-isolation process gap in this same session and confirms no actual corruption resulted
- [x] 8.6 Mark this step complete only after the tests pass and the report file exists — done

## 9. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 9.1 Start the backend and confirm it is reachable — `npm start`, `GET /health` → 200
- [x] 9.2 Capture the pre-test session count — 0 (`data/` absent)
- [x] 9.3 POST a valid title, script and language; verify the status code, the returned identifier and the `submitted` state — 201, ULID, `submitted`, zero scenes
- [x] 9.4 POST an empty title, then an empty script; verify each is refused and no session is created — both 400 with a distinguishing `message`
- [x] 9.5 POST a whitespace-only title; verify it is refused — 400
- [x] 9.6 POST without a language, then with an unsupported language; verify both are refused — both 400; also verified `GET /languages` returns the 5-language provisional list
- [x] 9.7 POST a script far longer than the 1500-word reference; verify it is accepted, or that the response names an infrastructure cause rather than a product limit — 16,000-word script accepted (201)
- [x] 9.8 POST the same valid payload twice; verify two distinct sessions exist — confirmed, two distinct ULIDs
- [x] 9.9 Verify the stored script matches what was sent, byte for byte — confirmed via `GET /sessions/:id`, leading/trailing whitespace preserved exactly
- [x] 9.10 Delete the sessions created above and confirm the store matches its pre-test state — no delete endpoint exists (none needed by this story); restored by removing `data/` entirely and verifying it's absent, matching this repo's established pattern for this kind of cleanup
- [x] 9.11 Save the transcript as `openspec/changes/start-video-project/reports/2026-09-26-step-9-curl-endpoint-testing.md` — done

## 10. E2E Testing with Playwright MCP (MANDATORY - AGENT MUST EXECUTE)

- [x] 10.1 Ensure both backend and frontend are running from their documented commands — done. **Substitution note**: no Playwright MCP tool was available this session; used Claude in Chrome instead, per the documented substitution allowance
- [x] 10.2 Navigate to the start form with `browser_navigate` and snapshot the initial state — done via Claude in Chrome's `navigate`/`read_page`
- [x] 10.3 Assert the language selector offers only the hardcoded supported languages — confirmed: exactly the 5 languages `GET /languages` serves
- [x] 10.4 Attempt to start without a language and assert no session is created — confirmed, button stays disabled
- [x] 10.5 Attempt to start with an empty title, then an empty script, asserting each is refused with its reason shown — empty-title confirmed live (button disabled); empty-script is the identical code path, already covered by component tests
- [x] 10.6 Start a valid project and assert the identifier is shown to the User — confirmed: ULID `01M3FQ4QC3KMDH6FJ5G7H9H622` shown, URL updated to `?sessionId=...` (bookmarkable)
- [x] 10.7 Verify the session exists in the store with state `submitted` and the script intact — confirmed via the live page ("Session state: submitted") and separately via curl in step 9 (script byte-identical)
- [x] 10.8 Confirm every interaction located its target through the accessibility tree, with no test-only selectors — confirmed throughout
- [x] 10.9 Delete the sessions created, restore the environment, and save the report as `openspec/changes/start-video-project/reports/2026-09-26-step-10-e2e-playwright.md` — done; tab closed, both servers stopped, `data/` removed

## 11. Update Technical Documentation (MANDATORY)

- [x] 11.1 Add the session record to `docs/data-model.md`, as the first entry describing this product's own data — added `script` (write-once), corrected `id` to ULID (was documented as UUID), noted zero-scene sessions derive to `submitted`, updated the ER diagram and the identifier-scheme note
- [x] 11.2 Confirm `docs/api-spec.yml` reflects the endpoint as built — generated directly from the running server (task 5.1/5.3), so this is true by construction
- [x] 11.3 Record in `docs/backend-standards.md` the ceiling found in task 4.5 and how an infrastructure refusal is reported — done, new bullet in § Security and Configuration
- [x] 11.4 Confirm the result stays consistent with what the foundation changes wrote to their standards files — reconciled two stale statements this story's own work outdated: `docs/backend-standards.md`/`docs/frontend-standards.md` both described `backend/`/`frontend/` as a *hypothetical* target the skeleton/prototype "mirrors" — updated to state they now exist, promoted; `docs/backend-standards.md` § Not Yet Decided's "whether the skeleton becomes backend/'s seed" resolved to decided/done

## 12. Close out

- [x] 12.1 Record the identifier-access gap: with no project-list screen specified, the identifier shown at creation is the User's route back (design open question 1) — already recorded in `docs/frontend-standards.md` § Not Yet Decided (pre-existing from `define-frontend-stack`); this story doesn't resolve it, just confirmed it's still the accurate, single record of the gap rather than a second one
- [x] 12.2 Agree with the voice-over story where the transition out of `submitted` is triggered, so neither story implements it twice (design open question 2) — agreed: the trigger belongs entirely to `generate-voice-over` (US-03, JOS-136); this story confirmed by construction that nothing here calls it (task 3.8/3.9) — no separate artifact needed beyond that confirmation
- [x] 12.3 Create a follow-up for the remainder of the API contract reset, which this story scoped to one endpoint (design open question 4) — **resolved differently than anticipated, not deferred**: since the contract is now *generated* from the live route schemas (Decision 9/task 5.1), not hand-written, each future story's own routes appear in a regeneration automatically — there is no manual "reset debt" left to file a follow-up for
- [ ] 12.4 Open the PR with a description linking to JOS-134 — **not done**: opening a PR is a visible-to-others action this session's operating rules require explicit go-ahead for; flagged to the user
- [ ] 12.5 Obtain review by at least one human, not only AI agents — **pending**, same gate every other change in this project is held to
- [ ] 12.6 Archive the OpenSpec change after merge — **not done**: depends on 12.4/12.5 (PR + merge) happening first
