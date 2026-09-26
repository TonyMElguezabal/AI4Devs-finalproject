# Define the live progress update mechanism

Linear-Issue: JOS-183

## Why

PRD v1.3 §8.3 requires that an open session page show each state change, result and error **as soon as it happens, without reloading**. It never says how. Two neighbouring changes already depend on the answer: `define-backend-stack` proves "a live push reaching an open page" against a mechanism it does not choose, and `define-frontend-stack` deliberately hides the push behind a single seam because this decision was unsettled. Every story that renders progress — US-18, US-19, US-21, US-34 — would otherwise invent its own transport and its own reconnection behaviour.

The harder half is not the transport. §12.1 lets the application restart mid-session, and a page can be disconnected while a laptop sleeps or a proxy times out an idle connection. What happens to the state changes emitted while nobody was listening is the question that decides whether the page is correct or quietly stale, and nothing in the PRD or the repository answers it.

## What Changes

- Establish the must-pass gates the mechanism has to clear: reaches an open page without a reload, survives a backend restart and a dropped connection without a manual reload, needs no authentication or fan-out layer (§12.3), and streams only the requested session's events (§12.3, AC22).
- Evaluate Server-Sent Events, WebSocket and polling against those gates, and state explicitly whether anything flows browser→server outside ordinary requests — if nothing does, a one-way transport is the conclusion rather than the assumption.
- **Decide replay versus resync** on reconnect, and record why. The server holds authoritative state (§12.1), which makes resync viable; replay only earns its retention and its event identifiers if intermediate transitions carry meaning a user must not miss.
- **Define the event payload shape** — what a session event and a scene event carry — as the contract US-18, US-19, US-34 and `define-frontend-stack` build against. It must carry the paused marker as a field separate from the session state (§8.1), and the per-stage provider and attempt count that diagnostics show (§11.2, US-34).
- Decide whether events carry a scene's **current state** or a delta, since that decides whether a duplicate or out-of-order delivery is harmless or corrupting.
- Decide the burst policy: whether events are coalesced per scene, and within what bound, given that §8.3 says "as soon as it happens" while §4.1 caps neither scenes nor provider calls.
- Decide the connection lifecycle: how many streams an open page opens, the heartbeat that keeps an idle connection alive, and the reconnection backoff.
- Run four experiments and record the results including the failures: a 200-scene burst, a disconnect with state changes during the gap, a backend restart mid-session, and a long idle stretch.
- Record the decision as an ADR, and write the mechanism together with its reconnection and catch-up rule into **both** `docs/backend-standards.md` and `docs/frontend-standards.md`.
- No product behaviour ships, and no user-facing capability changes.

## Capabilities

### New Capabilities

- `live-updates-foundation`: the guarantees this change establishes about how state reaches an open page — one documented mechanism, a defined event payload, a stated rule for what happens to events emitted while a page was disconnected, session-scoped delivery, and recorded evidence before implementation begins.

The product behaviours this change's experiments exercise remain owned by their own stories and will be specified there: US-18 and US-19 (progress by phase and by scene), US-21 (the paused marker), US-34 (diagnostics shown alongside).

### Modified Capabilities

None. `openspec/specs/` is still empty. The `backend-foundation`, `persistence-foundation` and `frontend-foundation` capabilities introduced by `define-backend-stack`, `define-persistence` and `define-frontend-stack` are not yet archived, so they are not existing specs this change can modify; all four must stay consistent.

## Impact

- **Documentation**: a live-updates section added to `docs/backend-standards.md` and to `docs/frontend-standards.md`, each describing the same mechanism from its own side; a new ADR.
- **Dependency on `define-backend-stack` (JOS-179)**: its walking skeleton already demonstrates a live push against an unnamed mechanism. That demonstration is a stand-in — this change settles the mechanism, and any observation of the skeleton's that depended on the stand-in must be revisited rather than inherited.
- **Dependency on `define-persistence` (JOS-181)**: resync-on-reconnect is only correct if the store is authoritative and a session's current state can be read in one request. If that change is unsettled, this one records which conclusions rest on the assumption.
- **Consumed by `define-frontend-stack` (JOS-180)**: its Decision 3 keeps the push behind one seam precisely so this mechanism can drop in. Its ADR names the observations that depended on a stand-in; this change closes them.
- **Contract for downstream tickets**: the event payload shape unblocks US-18, US-19, US-21 and US-34 — they render what this change defines rather than each inventing a field set.
- **Process**: `docs/openspec-tasks-mandatory-steps.md` Step N+2 tests endpoints with curl. A streaming endpoint is curl-testable but not with a request that terminates; this change exercises it as a held-open stream and records how, so later stories do not each improvise.
- **Scale risk**: a session with hundreds of scenes emits thousands of events, arriving in bursts when many scenes finish together. This change proves the burst behaviour now rather than discovering it during US-19.
- **No deployed systems, external APIs or user data are affected.** The experiments run against the stubbed provider and harness from `define-backend-stack`, so no credentials are exercised.
