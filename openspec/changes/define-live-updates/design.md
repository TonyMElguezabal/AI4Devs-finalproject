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
