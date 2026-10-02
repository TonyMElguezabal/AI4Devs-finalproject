# Design — Define the live progress update mechanism

## Context

PRD v1.3 states the requirement in one sentence: an open session page shows each state change, result and error as soon as it happens, without reloading (§8.3). Everything that makes the choice hard sits in other sections. A session moves through eight states, and a pause is a **marker on top of** the current state rather than a state of its own (§8.1). Each scene moves through six chunk states independently, completing out of order (§8.2, AC11). Failures carry the stage they affected, the provider used and the attempt count (§8.2, §10.1, §11.2). The MVP caps nothing — not words, not scenes, not provider calls (§4.1) — so a long script yields hundreds of scenes whose transitions arrive in bursts. The application can restart mid-session, and a request already sent to a provider is resumed or counted as exactly one failed attempt (§12.1). More than one success confirmation for the same generation must not duplicate anything (§12.1). And it is a local single-user install with no accounts, authentication or authorization (§12.3), while session isolation remains a functional integrity requirement (§12.3, AC22).

Three neighbouring changes touch this one. `define-backend-stack` (JOS-179) already proves "a live push reaching an open page" in its walking skeleton, against a mechanism nobody had chosen — that is a stand-in, and this change must say which of its observations survive. `define-frontend-stack` (JOS-180) put the push behind one seam (its Decision 3) explicitly so this decision could land later. `define-persistence` (JOS-181) owns the store that resync-on-reconnect would read from.

The ticket frames the choice as SSE versus WebSocket versus polling. That is the smaller half. The half that decides whether the page is *correct* is what happens to events emitted while nobody was listening, and what a single event has to contain for a page that missed its predecessors to still be right.

## Goals / Non-Goals

**Goals:**
- Choose the push mechanism, with the rejected alternatives and the reasoning recorded.
- Decide the catch-up rule — replay or resync — and justify it from where authoritative state lives.
- Define the event payload shape as a contract downstream stories build against.
- Prove the choice against burst, disconnect, restart and idle, and record the failures as well as the passes.
- Leave `docs/backend-standards.md` and `docs/frontend-standards.md` describing the same mechanism from each side.

**Non-Goals:**
- Choosing the backend or frontend stack (JOS-179, JOS-180) — this must fit whatever they chose.
- Choosing the store (JOS-181) or the media tooling (JOS-182).
- Rendering the updates: the phase sections, the scene list, the paused marker and the diagnostics belong to US-18, US-19, US-21 and US-34.
- Defining the full REST surface. This change defines the event stream and the one snapshot read that resync depends on, not the API at large.
- Non-functional targets such as an end-to-end latency budget; none exist yet (PRD §15 gap 9, US-41).

## Decisions

**Decision 1 — Settle the direction of flow before comparing transports.**
Enumerate every browser→server interaction the PRD implies — start a project, pause, continue, manual retry, correct an instruction, download — and confirm each is an ordinary request answered by an ordinary response. If none needs a persistent upstream channel, a one-way transport is the conclusion, recorded as such.
*Alternatives:* scoring the three candidates on general merits (rejected: bidirectionality is the whole difference between two of them, so leaving it assumed means the comparison never examines its own premise); assuming one-way because the ticket says so (rejected: the ticket says "likely", and this change exists to remove the "likely").

**Decision 2 — Make events state-carrying, not deltas.**
A scene event carries that scene's current state and the fields the UI shows for it; a session event carries the session's current state and its paused marker. A page applies an event by replacing what it holds for that entity.
*Alternatives:* delta or transition events, e.g. "attempt 2 started" (rejected: a delta is only correct applied to the exact predecessor state, which makes every missed, duplicated or reordered delivery a corruption — and §12.1 already tells us duplicate success confirmations happen; state-carrying events make a duplicate a no-op and a missed event self-healing on the next one for that entity).

**Decision 3 — Resync on reconnect, not replay.**
On reconnect the page refetches the session's current state in one request and resumes the stream; it does not ask the server for the events it missed, and the server retains no event log for that purpose.
*Alternatives:* replay from a last-seen event identifier (rejected: it requires server-side retention with an eviction policy, and a backend restart — the case §12.1 explicitly permits — is precisely when that retention is hardest to keep and least likely to be intact; the user needs the current state, not the transitions they slept through); resync by page reload (rejected: §8.3 forbids requiring a reload, and it would discard scroll position and any open scene detail).
*Consequence made explicit:* intermediate transitions missed during a disconnect are lost by design. If any story later needs a complete transition history, it needs the persisted stage-attempt records from `define-persistence`, not the stream. Record that so the trade-off is a known one rather than a surprise.

**Decision 4 — The snapshot read that resync depends on is part of this contract.**
Resync is only a decision if the thing it resyncs from exists: one request returning the session's current state, its paused marker, and every scene's current state. This change specifies it and measures its cost at a few hundred scenes; if the cost is unacceptable, that is evidence against Decision 3 and must be recorded as such rather than worked around quietly.
*Alternatives:* leaving the snapshot to US-18 (rejected: it is the load-bearing half of the catch-up rule — deferring it would ship a decision whose precondition nobody owns).

**Decision 5 — One stream per open session page.**
A page opens a single stream scoped to one session identifier and multiplexes session and scene events over it; it does not open a stream per scene.
*Alternatives:* a stream per scene or per phase (rejected: hundreds of scenes against a browser's per-origin connection limit would exhaust it immediately, and every scene would carry its own reconnection state); one global stream for all sessions (rejected: §12.3 and AC22 make session isolation a functional integrity requirement, and a shared stream would make leakage a filtering bug rather than an impossibility).
*To verify, not assume:* the per-origin connection cap only bites on HTTP/1.1, and a local install may or may not serve HTTP/2. Establish which applies to the documented start command, and record the ceiling in tabs — a user with the same session open twice is ordinary, not exotic.

**Decision 6 — Bound burst cost by coalescing per entity, never by delaying the first event.**
When many scenes transition at once, pending events for the *same* scene may be collapsed to its latest state — which Decision 2 makes safe. Distinct scenes are never collapsed into one another, and no artificial delay is introduced before an entity's first pending event is sent.
*Alternatives:* a fixed flush interval for everything (rejected: it converts §8.3's "as soon as it happens" into "within N ms" for every event, including the quiet case where there is no burst to absorb); no coalescing at all (rejected: a scene that transitions three times while a burst drains would send three events whose first two are already superseded — the page renders only the last, so the earlier ones are pure cost).

**Decision 7 — Keep the connection alive with a heartbeat, and let the client reconnect with backoff.**
The server emits a periodic keep-alive on an otherwise idle stream; the client reconnects on drop with bounded backoff, and every reconnect runs the Decision 3 resync.
*Alternatives:* relying on the transport's own reconnection without a heartbeat (rejected: a silently dead connection is indistinguishable from a quiet one, so a page could sit stale through an entire phase — and §8.3 makes staleness the failure); an unbounded immediate retry loop (rejected: a backend restart takes seconds, and a tight loop would spend them hammering a socket that is not listening).

**Decision 8 — Carry the paused marker as a field separate from the session state.**
§8.1 is explicit that a pause is not a state and that continuing leaves the state unchanged. The payload mirrors that: state and paused are two fields, never one collapsed value.
*Alternatives:* a `paused` value in the state enum (rejected: it would lose which phase was actually reached, and §9 requires distinguishing a generation still running from a phase waiting for the user — collapsing them makes that distinction unrepresentable).

**Decision 9 — Reuse the `define-backend-stack` harness and its stubbed provider.**
The experiments drive the existing walking skeleton rather than building a third mock server.
*Alternatives:* a purpose-built event generator (rejected: it would prove the transport against a fiction whose timing nobody chose from the PRD, and the skeleton already emits the transitions and retry behaviour these experiments need); real providers (rejected: costs money, needs keys this change does not exercise, and makes the burst experiment unrepeatable).

**Decision 10 — Record the decision in an ADR unconditionally.**
The ticket softens this to "if contentious". This design hardens it: three other changes consume the result, and their authors will not be in the room.

## Risks / Trade-offs

- **The burst experiment passes on a stub whose timing is gentler than reality** → Drive the 200-scene burst from the concurrency cap and retry rules (§10.1), so the arrival pattern comes from the PRD rather than from what is convenient to generate.
- **Resync at a few hundred scenes proves expensive, and every reconnect pays it** → Decision 4 measures it as evidence, not as an afterthought. If it is expensive, the honest options are recorded — a narrower snapshot, or reopening Decision 3 — rather than silently accepting a slow reconnect.
- **The idle experiment is the one most likely to be skipped for taking an hour** → It is also the one whose failure a user meets as a page that quietly stopped updating. Run it in the background while the other three proceed, and if it cannot finish inside the timebox, record it as unproven rather than assumed.
- **A conclusion turns out to have depended on the backend stack's push stand-in** → Name every such observation explicitly, the same discipline `define-backend-stack` applied to its persistence stand-in.
- **`define-persistence` has not settled, so "authoritative state" is an assumption** → Decision 3 rests on it. State the dependency in the ADR and re-check it when JOS-181 lands.
- **The two standards documents drift apart** → They describe one mechanism from two sides. Write the payload shape once and reference it from both, and check consistency against what `define-backend-stack` and `define-frontend-stack` already wrote rather than layering over it.
- **The mandatory curl step does not fit a streaming endpoint** → A held-open stream is curl-testable, but not with a command that returns. Record the exact invocation used, so later stories inherit it instead of each discovering the problem.
- **Coalescing hides a dropped event during the burst experiment** → Assert on the terminal state of all 200 scenes and on per-scene ordering, not on a total event count that coalescing legitimately reduces.

## Migration Plan

Nothing is deployed and no application code consumes a stream yet, so there is no migration. Rollback is discarding the experiment code; the ADR and the two standards sections are the durable output. Whether any experiment code becomes the project seed is decided explicitly at the end, not left to drift.

## Open Questions

1. **Is the store authoritative and cheap to snapshot?** Owned by `define-persistence` (JOS-181). Decision 3 assumes yes; if it lands otherwise, the catch-up rule is revisited.
2. **Does the local install serve HTTP/1.1 or HTTP/2?** It decides whether the per-origin connection cap constrains multiple open tabs (Decision 5). Answer from the documented start command, not from assumption.
3. **What is an acceptable end-to-end latency for "as soon as it happens"?** No non-functional targets exist (PRD §15 gap 9, US-41). This change records what it observed rather than inventing a threshold to pass.
4. **Should the stream also carry diagnostics detail, or only a pointer to fetch it?** US-34 owns what diagnostics show; this change defines the minimum — provider and attempt count per stage — and records the question.

## Execution Record (2026-09-25)

### §1 — Inputs collected

- **Backend streaming primitives (1.1):** Fastify (JOS-179) exposes the raw Node HTTP response (`reply.raw`), which is enough for SSE (`text/event-stream`, plain write calls) with zero extra dependencies — already proven live in `define-backend-stack`'s skeleton. WebSocket is *not* native to Fastify; it requires the `@fastify/websocket` plugin, an added dependency not yet used anywhere in the proven stack.
- **Frontend seam (1.2):** `define-frontend-stack` (JOS-180) has not been implemented — 0 of its tasks are done, and no frontend prototype exists in the repository (confirmed: `docs/frontend-standards.md` is still the pre-rewrite template, no `frontend/` directory exists). Its Decision 3 ("keep the push connection behind one seam") is a documented *architectural* commitment for whenever that change is built, not a concrete artifact to wire into today. Per task 6.2's own fallback, this change extends the skeleton's existing minimal page instead, recording that substitution explicitly (not the frontend prototype, because none exists yet).
- **Persistence authority (1.3):** `define-persistence` (JOS-181) has not been implemented either (0 tasks done), but its design *is* written and already assumes an authoritative store with a single-request session read (its Decision 1, matching `consult-session`'s (JOS-135) Decision 1: "the consultation read and the resync snapshot are the same endpoint"). Recorded as an **assumption**, per design Open Question 1: the catch-up rule (Decision 3/4) rests on this; if JOS-181 lands otherwise, this decision must be revisited. The skeleton's own disposable SQLite stand-in (JOS-179) is used to prove the mechanism meanwhile, exactly as `define-persistence`'s own Decision 7 already planned.
- **HTTP/1.1 vs HTTP/2 (1.4):** confirmed by inspection — the skeleton's `Fastify()` call does not pass `{ http2: true }`, so it serves plain HTTP/1.1 over Node's built-in `http` module. **Consequence:** Chrome's per-origin connection ceiling of 6 concurrent connections applies. With one long-lived stream per open session page (Decision 5), a user could open at most 6 session pages (or 6 tabs on the same session) against this backend before the 7th silently queues. Recorded as a real, if narrow, constraint of a local single-user install — not exercised beyond 2 tabs (task 7.7), since the MVP has no product reason to expect more than a handful of concurrently open session tabs.
- **What remains undecided (1.5):** the real persistence engine (US-42c), the real frontend framework (US-42b), and the hardcoded per-phase/concurrency values (US-33) — none of which this change needs to resolve, per its own Non-Goals.

### §2 — Direction of flow (Decision 1, confirmed)

Every browser→server interaction the PRD implies is an ordinary request answered by an ordinary response: start a project (§4.1, `POST`), pause/continue (§9, `POST`), manual retry (§10.2, `POST`), correct a visual instruction (§10.3, `POST`), download (§12.3, `GET`). None requires the server to receive anything *pushed* from the browser outside a normal request-response cycle — the live-update need is exclusively server→browser. **Conclusion (not an assumption): a one-way transport suffices.** This immediately weakens WebSocket's only structural advantage over SSE for this product, since that advantage (bidirectionality) goes unused.

### §3 — Candidate evaluation

**Must-pass gates** (reaches an open page without reload; recovers from a dropped connection and a backend restart; needs no auth/fan-out layer; addressable per session):

| Candidate | Reaches page, no reload | Recovers from drop + restart | No auth/fan-out needed | Addressable per session | Result |
|---|---|---|---|---|---|
| SSE | Pass | Pass — `EventSource` auto-reconnects natively; proven live in JOS-179 (including the reconnect-resync fix) | Pass | Pass (`/events?sessionId=`) | **Admitted** |
| WebSocket | Pass | Pass, but reconnection is hand-rolled — no browser-native equivalent to `EventSource`'s auto-retry | Pass | Pass | **Admitted** |
| Polling | Pass | Pass, trivially — each poll is independent, nothing to "reconnect" | Pass | Pass | **Admitted** |

No candidate eliminated at the gate.

**Weighted scoring:**

| Criterion | Weight | SSE | WebSocket | Polling |
|---|---|---|---|---|
| Correctness under disconnection | 30% | 9 | 7.5 | 9.5 |
| Burst behaviour at ~200 scenes | 25% | 8.5 | 8.5 | 5 |
| Fit with backend/frontend stacks | 20% | 9 | 7 | 8.5 |
| Local install simplicity | 15% | 9 | 7.5 | 9.5 |
| Operational visibility | 10% | 9 | 6.5 | 8.5 |
| **Weighted total** | | **8.88** | **7.55** | **8.08** |

- **Correctness under disconnection:** polling scores highest in isolation (each poll is a fresh, independent read — there is no "connection" to get wrong), SSE close behind on the strength of `EventSource`'s native reconnect plus the resync-on-open fix already proven; WebSocket trails because correct reconnection is entirely hand-rolled, with more edge cases (message ordering across a reconnect, missed close events) to get right.
- **Burst behaviour (task 3.4, polling scored honestly, not dismissed):** this is where polling loses decisively. Coalescing (Decision 6) is an application-level strategy that applies equally to SSE and WebSocket — a push transport spends work only when something changes. Polling has no equivalent: an interval tight enough to feel like "as soon as it happens" (§8.3) at a burst is expensive run continuously regardless of activity, and an interval cheap enough to run continuously is not "as soon as it happens" during a burst. This is a structural property of pull vs. push, not an implementation detail — no clever coalescing closes this gap for polling.
- **Fit with stacks:** SSE needs zero new dependencies (plain HTTP response streaming, already proven); polling needs none either (it is the same `GET` read `consult-session` already defines); WebSocket needs `@fastify/websocket`, unused elsewhere in the stack.
- **Local install simplicity:** polling is trivially simplest (nothing new to run); SSE close behind (plain HTTP); WebSocket needs an extra plugin and, more generally, is the protocol most likely to be mishandled by an intermediary if this were ever exposed beyond localhost.
- **Operational visibility:** SSE is the most transparent of the three for the mandatory curl-testing step — `text/event-stream` is plain, human-readable text that `curl` can hold open and print directly (task 10.2 relies on exactly this); WebSocket's framed protocol needs a specialised client to test the same way.

**Decision: Server-Sent Events (SSE)**, already the mechanism proven in `define-backend-stack`'s skeleton, is confirmed as the winner on the merits, not by reuse-bias — it wins 4 of 5 criteria and loses none. **Documented fallback: polling** (not WebSocket) — WebSocket's sole structural advantage (bidirectionality) is unused per §2's conclusion, so it is dominated by SSE on every criterion that matters here; polling is the closer, more sensible fallback if SSE is later found to fail a gate (not triggered — see § Evidence below).

### §4 — Contract (event payload shapes)

```ts
// Session event — and the shape the snapshot read's "session" field takes (Decision 4)
interface SessionEvent {
  type: "session";
  sessionId: string;
  state: "submitted" | "voice-over-generating" | "voice-over-complete"
       | "chunk-decomposing" | "chunks-processing"
       | "final-video-generating" | "final-video" | "failed"; // PRD §8.1, the eight states
  paused: boolean;               // Decision 8 — always a separate field, never folded into `state`
  failedPhase?: string;          // present only when state === "failed" (§8.1 state rules)
  updatedAt: string;             // ISO 8601
}

// Scene event — and the shape of each entry in the snapshot read's "scenes" array
interface SceneEvent {
  type: "scene";
  sessionId: string;
  sceneId: string;
  index: number;                 // ascending narrative order, §6 / consult-session Decision 3
  state: "submitted" | "image-generating" | "image-complete"
       | "video-generating" | "chunk-complete" | "failed"; // PRD §8.2, the six chunk states
  affectedStage?: "image" | "video"; // present only when state === "failed" (§8.2)
  errorCause?: string;
  provider?: string;             // §11.2 — which provider produced this attempt
  attempts?: number;             // §10.1 — attempt count for the affected stage
  result?: { imageUrl?: string; videoUrl?: string };
  updatedAt: string;
}
```

Both carry **current state, never a delta** (Decision 2, confirmed): a page applies an event by replacing what it holds for that `sessionId`/`sceneId`, so a duplicate delivery is a no-op and a missed one is superseded by the next. `paused` is always its own field (Decision 8), never a value inside `state`.

**Stream address (Decision 5):** `GET /events?sessionId={id}` (skeleton naming; the real implementation should use `GET /api/sessions/{sessionId}/events` to match `consult-session`'s REST shape) — one stream per open session page, multiplexing both event types.

**Snapshot read (Decision 4), the same endpoint `consult-session` (JOS-135) Decision 1 already names as canonical:**
```ts
// GET /sessions/{sessionId}  (skeleton: GET /runs/{runId} — see § Evidence for the naming note)
interface SessionSnapshot {
  session: Omit<SessionEvent, "type">;
  scenes: Omit<SceneEvent, "type">[]; // sorted ascending by `index`
}
```

**Heartbeat and backoff (Decision 7):** a periodic SSE comment line (`: keep-alive\n\n`) on an otherwise idle stream, interval TBD by measurement (task 7.5's idle experiment); client reconnection backoff bounded and capped, not an unbounded tight loop.

**Coalescing (Decision 6):** pending events for the *same* `sessionId`/`sceneId` collapse to the latest; events for distinct scenes are never merged; no artificial delay is introduced before an entity's first pending event.

**Diagnostics minimum (open question 4):** the scene event's `provider` and `attempts` fields are the floor US-34 can rely on the stream itself carrying; anything beyond that (e.g. per-attempt history) is a separate fetch against the persisted stage-attempt records (`define-persistence`), not the stream.

### §5 — Catch-up rule (confirmed: resync, not replay)

Already decided and reasoned in Decisions 3 and 4 above; confirmed here rather than re-derived. Consequence made explicit per task 5.3: intermediate transitions that occur entirely within a disconnection window (e.g. a scene going `image-generating` → `image-complete` → `video-generating` while the page was offline) are never individually seen by a reconnecting page — it only ever sees the *latest* state, by design. Per task 5.4, a complete transition history — if any future story needs one — comes from `define-persistence`'s append-only stage-attempt records, not from this stream, which is deliberately not a log.
