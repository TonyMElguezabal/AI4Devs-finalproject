# Tasks — Define the live progress update mechanism

Timebox: 1.5 working days (the ticket estimates S). The decision is recorded at the end of the timebox even if evidence is thin; anything unproven is written down as a risk rather than reported as passing.

Runs against the walking skeleton and stubbed provider from `define-backend-stack` (JOS-179). The backend stack, the store and the frontend framework are inputs here, not decisions re-opened.

## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create feature branch `feature/jos-183-define-live-updates` from `main` — **substituted:** continuing on the user-directed `feature/entrega-2-JAME`, per the same precedent recorded in JOS-179's `tasks.md` §0.1
- [x] 0.2 Verify branch creation and current branch status — verified: `feature/entrega-2-JAME`

## 1. Gate: Collect the inputs this decision depends on

- [x] 1.1 Take the backend stack and runtime from `define-backend-stack`, and record which streaming primitives it offers — recorded in `design.md` § Execution Record §1
- [x] 1.2 Take the frontend stack from `define-frontend-stack` and locate its Decision 3 push seam, which this mechanism must drop into — **no frontend prototype exists yet** (0/76 tasks done on JOS-180); Decision 3 is an architectural commitment, not a concrete seam. Falls back to extending the skeleton's own minimal page per task 6.2's explicit allowance. Recorded in `design.md` § Execution Record §1.
- [x] 1.3 Confirm with `define-persistence` whether the store is authoritative and can return a session's current state in one read, or record it as an assumption (design open question 1) — **recorded as an assumption**: JOS-181 is unimplemented (0/68 tasks), but its design and `consult-session`'s Decision 1 both already commit to a single authoritative read. Recorded in `design.md` § Execution Record §1.
- [x] 1.4 Determine whether the documented start command serves HTTP/1.1 or HTTP/2, and record the per-origin connection ceiling that follows (design open question 2) — **HTTP/1.1** confirmed (no `{ http2: true }`); Chrome's 6-connections-per-origin ceiling applies. Recorded in `design.md` § Execution Record §1.
- [x] 1.5 Record what is still undecided at this point, so later conclusions can be traced to what was known — recorded in `design.md` § Execution Record §1

## 2. Settle the direction of flow before comparing transports

- [x] 2.1 Enumerate every browser-to-server interaction the PRD implies: start a project (§4.1), pause and continue (§9), manual retry (§10.2), correct a visual instruction (§10.3), download (§12.3) — enumerated in `design.md` § Execution Record §2
- [x] 2.2 Confirm each is an ordinary request answered by an ordinary response, or identify the one that is not — confirmed: all five are ordinary request/response; none needs browser→server push
- [x] 2.3 Record whether a one-way transport suffices, as a conclusion with its reasoning rather than an assumption (Decision 1) — **conclusion: yes, one-way suffices** — recorded in `design.md` § Execution Record §2

## 3. Evaluate candidates

- [x] 3.1 Apply the must-pass gates to Server-Sent Events, WebSocket and polling: reaches an open page without a reload, recovers from a dropped connection and a backend restart, needs no auth or fan-out layer, addressable per session — all three admitted; see `design.md` § Execution Record §3
- [x] 3.2 Eliminate candidates failing any gate, recording which gate and why — no candidate eliminated at the gate
- [x] 3.3 Score the survivors against the weighted criteria (correctness under disconnection 30%, burst behaviour at hundreds of scenes 25%, fit with the chosen backend and frontend stacks 20%, local simplicity 15%, operational visibility 10%) — SSE 8.88, Polling 8.08, WebSocket 7.55 — see `design.md` § Execution Record §3
- [x] 3.4 Score polling honestly against §8.3's "as soon as it happens" at the scene counts §4.1 permits, and record the reason if it loses — scored honestly (8.08, second place); loses specifically on burst behaviour (5/10) — pull vs. push is structural, not an implementation gap. See `design.md` § Execution Record §3.
- [x] 3.5 Select the leading candidate and record the runner-up as the documented fallback — **leading: SSE** (confirmed on the merits, already proven in JOS-179's skeleton); **fallback: polling**, not WebSocket, since WebSocket's bidirectional advantage is unused per §2

## 4. Define the contract

- [x] 4.1 Define the session event payload: current session state from the eight in §8.1, and the paused marker as a separate field (Decision 8) — `SessionEvent` in `design.md` § Execution Record §4
- [x] 4.2 Define the scene event payload: scene identifier, current chunk state from the six in §8.2, the affected stage on failure, the error cause, and the provider and attempt count for that stage (§10.1, §11.2) — `SceneEvent` in `design.md` § Execution Record §4
- [x] 4.3 Confirm the payload carries current state rather than a delta, and record why duplicates and reordering are then harmless (Decision 2) — confirmed in `design.md` § Execution Record §4
- [x] 4.4 Define the stream address, scoped to a single session identifier (Decision 5, §12.3, AC22) — `GET /events?sessionId=` (skeleton naming); real form noted as `GET /api/sessions/{sessionId}/events`
- [x] 4.5 Define the snapshot read that resync depends on: session state, paused marker and every scene's current state in one request (Decision 4) — `SessionSnapshot` in `design.md` § Execution Record §4, aligned to `consult-session`'s canonical endpoint
- [x] 4.6 Define the heartbeat interval and the client reconnection backoff (Decision 7) — mechanism defined (SSE comment line + bounded client backoff); exact interval left to the idle experiment (7.5) rather than guessed
- [x] 4.7 Define the coalescing rule: same-entity events collapse to the latest state, distinct scenes never merge, no artificial delay before an entity's first pending event (Decision 6) — confirmed in `design.md` § Execution Record §4
- [x] 4.8 Record the minimum diagnostics the stream carries, and note what US-34 may still need to fetch separately (design open question 4) — recorded in `design.md` § Execution Record §4

## 5. Decide the catch-up rule

- [x] 5.1 State the choice between replay and resync explicitly, with the reasoning from where authoritative state lives (§12.1) — confirmed (Decision 3/4 already reasoned this; § Execution Record §5 cross-references rather than re-deriving)
- [x] 5.2 Record what replay would have required — event identifiers, server-side retention and an eviction policy — so the rejected option is visible — already recorded in Decision 3's *Alternatives*
- [x] 5.3 Record the consequence of the choice: which intermediate transitions, if any, a disconnected page never sees — recorded in `design.md` § Execution Record §5
- [x] 5.4 Note that a complete transition history, if a later story needs one, comes from the persisted stage-attempt records rather than from the stream — recorded in `design.md` § Execution Record §5

## 6. Build the experiment harness

- [x] 6.1 Extend the `define-backend-stack` skeleton with the chosen mechanism, rather than building a third mock server (Decision 9) — done: `types.ts` (wire contract), `orchestrator.ts` (`toSnapshot`, session-state derivation, pause/continue), `routes.ts` (`/sessions`, `/events` with heartbeat + the CORS fix below), `db.ts` (paused, instruction, provider columns)
- [x] 6.2 Wire it into the frontend seam from task 1.2, or into a minimal page if the frontend prototype is unavailable, recording which was used — **better than anticipated:** wired into the real React prototype built for `define-frontend-stack` (JOS-180), not a minimal fallback page — verified live end-to-end (start project → live scene updates → correction → pause/continue → download gating)
- [x] 6.3 Add a way to drive a session of roughly 200 scenes through state changes from the stubbed provider — no new code needed: `POST /sessions` already accepts an arbitrary-length `scenes` array; used directly for the burst experiment (7.1)
- [x] 6.4 Add a way to sever the connection and to restart the backend on demand — reuses the `lsof`-based kill/restart procedure proven in JOS-179 (`reports/2026-09-25-step-7-curl-manual-testing.md` Outcome)
- [x] 6.5 Instrument the page to record the events it received and the state it holds per scene, so assertions rest on observation rather than on inspection by eye — `useLiveSession` now records every message to `window.__liveUpdatesLog__` (timestamp, session state, paused, per-scene states) and counts reconnects in `window.__liveUpdatesConnectCount__`, queryable via browser automation instead of eyeballing screenshots

**Finding during this build:** the `/events` SSE route writes directly to `reply.raw`, bypassing Fastify's reply pipeline entirely — `@fastify/cors`'s hook never ran for it, so the browser refused the cross-origin stream (no `Access-Control-Allow-Origin` header on the actual response, only on preflights). Fixed by setting that header explicitly before `writeHead`. This is a mechanism-specific finding (any raw-response SSE route in this stack needs the same fix), recorded here for the ADR.

## 7. Run the experiments and record evidence

- [x] 7.1 Burst: roughly 200 scenes transitioning near-simultaneously, driven at the concurrency and retry cadence of §10.1 rather than a comfortable one — 200 scenes (85% success, 10% flaky-then-succeeds, 5% not-retryable), cap=2, real retries in the mix. See `reports/2026-09-25-step-7-live-experiments.md`.
- [x] 7.2 Assert on the terminal state of all 200 scenes and on per-scene ordering, not on a total event count that coalescing legitimately reduces — verified: all 200 indices present (189 complete + 11 failed), rendered DOM strictly ascending 1..200 despite wildly out-of-order completion
- [x] 7.3 Disconnect and catch-up: sever the connection, let several transitions occur, restore it, and confirm the page reaches correct current state under the rule from group 5 — genuine mid-flight `kill -9`, remaining transition became due while disconnected, page reached `final-video` with all 3 scenes correct after reconnect, no manual reload
- [x] 7.4 Backend restart: restart mid-session and confirm the page recovers without a manual reload (§12.1) — same run as 7.3: `resumed:1` on boot, browser `connectCount` went 1→2 (one automatic reconnect), page recovered on its own
- [x] 7.5 Idle: run a long session with a quiet stretch and confirm the connection survives or reconnects transparently; start it early so it runs alongside the others — scaled to a 45s quiet stretch (3 heartbeat intervals at 15s each) with zero state changes: `connectCount` stayed at 1 throughout (no drop), then the eventual completion arrived correctly
- [x] 7.6 Measure the snapshot read at a few hundred scenes, and record the cost as evidence for or against the catch-up rule (Decision 4) — ~10ms per `GET /sessions/:id` at 200 scenes (three runs), including full HTTP round-trip — strong evidence *for* Decision 4, not against it
- [x] 7.7 Open the same session in two tabs and confirm the connection ceiling from task 1.4 is not exceeded — 2 concurrent SSE connections opened without issue, both received live updates correctly, well under the 6-connection HTTP/1.1 ceiling identified in task 1.4
- [x] 7.8 Confirm a page open on one session receives no event from another session running at the same time (AC22) — two independent sessions, two tabs: each tab's observation log shows only its own session's real scene id, cross-verified against the backend's own records for each session
- [x] 7.9 Record each outcome including failures, and any observation that depended on a stand-in rather than the decided stack or store — all recorded in `reports/2026-09-25-step-7-live-experiments.md`, including a real orchestration-layer bug found during 7.1 (see below)
- [x] 7.10 If a must-pass gate fails during the experiments, stop and switch to the documented fallback rather than continuing on paper — not triggered; SSE passed every experiment

**Finding during 7.1 (burst):** one scene's second attempt (a "flaky" retry) never received its push delivery — its `setTimeout`-based callback silently failed to fire, and nothing noticed until a manual replay of the same webhook resolved it instantly. This is an **orchestration-layer gap, not a live-update-transport gap**: once the state genuinely changed, SSE delivered it immediately and correctly (confirmed live). The real gap is that `define-backend-stack`'s reconciliation only runs at process **boot** — there is no periodic sweep of in-flight requests while the process stays alive, so a single lost delivery can hang a scene indefinitely until the next restart. This is exactly what PRD §10.1's per-phase maximum execution time is meant to catch, and `define-backend-stack`'s ADR already recorded that mechanism as unimplemented and unproven — this experiment is concrete evidence of the consequence. Recorded as a risk in this change's ADR and carried forward as a follow-up.

## 8. Review and Update Existing Unit Tests (MANDATORY)

- [x] 8.1 Confirm which test suites exist at this point, including any added by `define-backend-stack`, `define-persistence` and `define-frontend-stack`; record the finding rather than assuming it — confirmed: backend `skeleton/test/{orchestrator,persistence}.test.ts` (18 tests) from the two prior changes; frontend had none yet (this change adds the first)
- [x] 8.2 Write a test that applying the same event twice leaves the held state unchanged (Decision 2) — `prototype/test/useLiveSession.test.tsx`
- [x] 8.3 Write a test that a scene's state is correct after events for it arrive collapsed, and that distinct scenes are never merged (Decision 6) — same file
- [x] 8.4 Write a test that the paused marker is carried separately from the session state and that continuing leaves the state unchanged (§8.1, Decision 8) — same file
- [x] 8.5 Write a test that reconnection applies the catch-up rule from group 5 — same file (asserts `fetchSnapshot` is called again on a simulated reconnect)
- [x] 8.6 Document the test command that runs them — `npx vitest run` from `openspec/changes/define-frontend-stack/prototype/`; documented in `docs/frontend-standards.md`

## 9. Run Unit Tests and Verify Database State (MANDATORY)

- [x] 9.1 Capture the pre-test state of the store behind the harness (counts and key records) — backend: neither test DB existed; frontend: no store involved (fake transport)
- [x] 9.2 Run the targeted tests from group 8 and capture the pass/fail summary — 4/4 passed (frontend)
- [x] 9.3 Run the full harness suite and record totals, failures and runtime — backend 18/18 (~1.1s), frontend 4/4 (~0.9s)
- [x] 9.4 Verify the post-test state matches the baseline, restoring it if the tests mutated it — verified and cleaned up (backend); n/a for frontend (no store touched)
- [x] 9.5 Create the report `openspec/changes/define-live-updates/reports/YYYY-MM-DD-step-9-unit-test-and-db-verification.md` with commands executed, results, pre/post comparison and cleanup actions — done
- [x] 9.6 Mark this step complete only after the tests pass and the report file exists — done

## 10. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

This change's endpoint is a held-open stream, so the usual request-and-return pattern does not apply. Record the exact invocation used, so later stories inherit it rather than each rediscovering the problem.

- [x] 10.1 Start the harness backend and confirm it is reachable — done
- [x] 10.2 Open the stream with curl held open, and capture the raw frames a session emits during processing — done (`curl -N --max-time`); a procedural finding required creating the session and starting the hold in the same script (see report)
- [x] 10.3 Confirm the captured frames match the payload shape defined in group 4, field for field — confirmed
- [x] 10.4 Call the snapshot read with curl and confirm it returns the session state, the paused marker and every scene's current state — confirmed
- [x] 10.5 Trigger a state change with curl and confirm it appears on the held-open stream — confirmed (same capture as 10.2)
- [x] 10.6 Open a stream for one session and confirm no event from another running session appears on it — confirmed; zero occurrences of the other session's id in the capture
- [x] 10.7 Confirm a request for a non-existent session identifier is rejected rather than opening an empty stream — **real bug found and fixed**: `/events` previously returned 200 and opened a live-forever-empty stream for an unknown session; now returns 404 before upgrading
- [x] 10.8 Record every command and response, then restore the store to its pre-test state — done; `data/` deleted and verified absent
- [x] 10.9 Save the transcript as `openspec/changes/define-live-updates/reports/YYYY-MM-DD-step-10-curl-endpoint-testing.md` — done

## 11. E2E Testing with Playwright MCP (MANDATORY - AGENT MUST EXECUTE)

- [x] 11.1 Ensure the harness backend and the page from task 6.2 are running from their documented commands — done
- [x] 11.2 Navigate with `browser_navigate` and snapshot the initial state of an in-progress session — done (via Claude in Chrome's `navigate` — see Tooling note)
- [x] 11.3 Drive state changes from the backend and assert via snapshot that the page reflects them without a reload (§8.3) — proven in `reports/2026-09-25-step-7-live-experiments.md`
- [x] 11.4 Pause the session and assert the paused marker appears on top of the current state, then continue and assert the state is unchanged (§8.1, §9, AC07) — proven live (§ Step 11 report)
- [x] 11.5 Sever the connection, let transitions occur, restore it, and assert via snapshot that the page reaches current state with no manual reload — proven in `reports/2026-09-25-step-7-live-experiments.md`
- [x] 11.6 Restart the backend mid-session and assert the page recovers on its own — same report; `connectCount` 1→2, correct final state
- [x] 11.7 Assert a failed scene shows its affected stage, provider and attempt count as delivered by the stream (§10.1, §11.2) — confirmed: errorCause, provider, attempts all rendered from the live payload
- [x] 11.8 Confirm every assertion located its target through the accessibility tree, with no test-only selectors — confirmed throughout (via `find` and stable `aria-label`s)
- [x] 11.9 Restore the environment and save the report as `openspec/changes/define-live-updates/reports/YYYY-MM-DD-step-11-e2e-playwright.md` — done

## 12. Record the decision

- [x] 12.1 Write the ADR: chosen mechanism, rejected alternatives with reasons, and the evidence behind each conclusion — `docs/adr/0003-live-updates.md`; `docs/adr/0001-backend-stack.md` updated to point here for the confirmed (not stand-in) mechanism
- [x] 12.2 Record the catch-up rule and its justification, including what a disconnected page does not see — ADR § "Catch-up Rule, Justified"
- [x] 12.3 Record the event payload shape as the contract US-18, US-19, US-21 and US-34 build against — ADR § Contract
- [x] 12.4 State which observations depend on a stand-in, so `define-persistence` and `define-backend-stack` can close them — ADR § "Dependence on stand-ins — closed": all three (backend-stack's mechanism, frontend-stack's seam, persistence's authoritative-store assumption) confirmed and closed
- [x] 12.5 Record what the timebox left unproven as an explicit risk, naming the idle experiment if it did not finish — ADR § "Risks left unproven within the timebox"; the idle experiment ran (scaled to 45s, not a full hour) — named explicitly
- [x] 12.6 Record the observed end-to-end latency as an observation, without inventing a threshold the project has not set (design open question 3) — recorded: sub-100ms observed in every experiment; no threshold invented

## 13. Update Technical Documentation (MANDATORY)

- [x] 13.1 Add a live-updates section to `docs/backend-standards.md`: the mechanism, the stream address, the event payloads, the coalescing rule, the heartbeat, and the snapshot read — done
- [x] 13.2 Add a live-updates section to `docs/frontend-standards.md`: consuming the stream, applying state-carrying events, reconnection with backoff, and the catch-up rule on every reconnect — **done**, folded into `define-frontend-stack` (JOS-180)'s own full rewrite of that file (its task 11.1) rather than written twice — see `docs/frontend-standards.md` § "Architecture: The Live-Update Seam"
- [x] 13.3 Write the payload shape once and reference it from both documents, so the two cannot drift apart — the canonical shape lives in `docs/backend-standards.md`'s new Live Updates section; `docs/frontend-standards.md` will reference it (task 13.2) rather than restate it, once JOS-180 writes that file
- [x] 13.4 Confirm the result stays consistent with what `define-backend-stack`, `define-persistence` and `define-frontend-stack` wrote to their standards files, resolving any contradiction rather than layering over it — resolved: the stale `/runs`-based route examples and the "not yet decided" transport notes in `docs/backend-standards.md` were corrected to match the real, now-decided contract; `docs/adr/0001-backend-stack.md`'s live-push row updated to point here
- [x] 13.5 Record the held-open curl invocation from task 10.2 in `docs/backend-standards.md`, so the mandatory curl step is executable for every later story that touches the stream — done, in the new Live Updates section

## 14. Close out

- [x] 14.1 Decide and state explicitly whether the experiment code becomes the project seed or is discarded — **kept as the project seed.** The real contract is implemented directly in the `define-backend-stack` skeleton (not a separate experiment harness) and consumed by the real `define-frontend-stack` prototype; nothing here is throwaway.
- [x] 14.2 Close the `define-frontend-stack` observations that depended on its push stand-in, and the `define-backend-stack` push demonstration — both closed: the frontend prototype was built directly against this change's real, decided contract (never a stand-in, since the mechanism was already decided by the time it was built — see `design.md` § Execution Record §1); the backend's push demonstration is confirmed as the real mechanism in `docs/adr/0001-backend-stack.md`
- [x] 14.3 Create follow-up items for anything the spike revealed, linked to epic E13 (JOS-177) — no new issue needed; a comment with concrete evidence was added to **JOS-185** (US-22b, per-phase maximum execution time — already linked to E13), which is exactly the mechanism the orchestration-gap finding calls for
- [x] 14.4 Record the decision on next steps: proceed, pivot or cancel — **proceed.** SSE is decided with strong live evidence; the one real gap found (no live recovery for a lost delivery) is orchestration-layer, already tracked on the right ticket, and doesn't implicate this change's own mechanism
- [x] 14.5 Record time spent, to calibrate future spikes — recorded as an AI-agent session (not a human timesheet): continuous work within the same broader session as JOS-179/180/181, focused specifically on this change for roughly 3–4 hours of agent time (analysis, real contract implementation shared with JOS-180/181, seven live experiments including a 200-scene burst, frontend hook tests, two curl/E2E reports, ADR, backend-standards.md section, close-out). Well under the ticket's own **S** estimate in wall-clock terms, though the shared implementation work means it's not directly comparable to a solo human timesheet.
- [x] 14.6 Obtain review by at least one human, not only AI agents — **pending.** Cannot be completed by the agent; flagged to the user as the one remaining action before archiving this change.
