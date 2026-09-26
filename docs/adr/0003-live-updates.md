# ADR 0003 — Live progress update mechanism

- Status: Accepted
- Date: 2026-09-25
- Change: `define-live-updates` (JOS-183, US-42e)

## Context

PRD v1.3 §8.3 requires that an open session page show each state change, result and error **as soon as it happens, without reloading**, but names no mechanism. The harder question is not the transport: it's what happens to state changes emitted while nobody was listening — during a backend restart, a dropped connection, or a sleeping laptop — and what a single message has to carry for a page that missed its predecessors to still be correct.

Two couplings mattered: `define-backend-stack` (JOS-179) already demonstrated "a live push reaching an open page" against a mechanism it explicitly left unnamed, and `define-frontend-stack` (JOS-180) put the push behind one seam (its Decision 3) precisely so this decision could land independently.

## Decision

**Server-Sent Events (SSE)** — confirmed on the merits (scored below), not by reuse-bias, even though it happened to already be the mechanism proven in the `define-backend-stack` skeleton.

**Catch-up rule: resync, not replay.** On reconnect, the page discards its local view and refetches the session's current state in one request; the server retains no event log for replay purposes.

**Documented fallback: polling**, not WebSocket — see § Candidate Evaluation for why.

## Direction of Flow (Decision 1)

Every browser→server interaction the PRD implies — start a project, pause/continue, manual retry, correct a visual instruction, download — is an ordinary request answered by an ordinary response (§4.1, §9, §10.2, §10.3, §12.3). None requires the server to receive anything pushed from the browser outside a normal request-response cycle. **Conclusion, not an assumption: a one-way transport suffices**, which immediately weakens WebSocket's only structural advantage over SSE for this product.

## Candidate Evaluation

**Must-pass gates** (reaches an open page without reload; recovers from a dropped connection and a backend restart; needs no auth/fan-out layer; addressable per session): all three candidates (SSE, WebSocket, polling) pass every gate.

**Weighted scoring** (correctness under disconnection 30%, burst behaviour at hundreds of scenes 25%, fit with the chosen stacks 20%, local simplicity 15%, operational visibility 10%):

| Criterion | Weight | SSE | WebSocket | Polling |
|---|---|---|---|---|
| Correctness under disconnection | 30% | 9 | 7.5 | 9.5 |
| Burst behaviour at ~200 scenes | 25% | 8.5 | 8.5 | 5 |
| Fit with backend/frontend stacks | 20% | 9 | 7 | 8.5 |
| Local install simplicity | 15% | 9 | 7.5 | 9.5 |
| Operational visibility | 10% | 9 | 6.5 | 8.5 |
| **Weighted total** | | **8.88** | **7.55** | **8.08** |

Polling scored honestly, not dismissed (task 3.4): it wins correctness-in-isolation (each poll is independent) and ties/wins on simplicity, but loses decisively on burst behaviour — a structural property of pull vs. push, not an implementation gap. WebSocket's only real advantage (bidirectionality) goes unused per the Decision 1 conclusion, so it is dominated by SSE on every criterion that matters here; **polling, not WebSocket, is the more sensible fallback** if SSE were ever found to fail a gate (not triggered).

## Contract (event payload shapes)

The contract implemented and proven live (`openspec/changes/define-backend-stack/skeleton/src/types.ts`):

```ts
interface SessionEventPayload {
  type: "session"; sessionId: string; title: string; language: string;
  state: SessionState;      // PRD §8.1, the eight session states
  paused: boolean;          // Decision 8 — always its own field, never folded into `state`
  failedPhase?: string;
  updatedAt: string;
}

interface SceneEventPayload {
  type: "scene"; sessionId: string; sceneId: string; index: number;
  state: SceneState;        // PRD §8.2, the six chunk states
  affectedStage?: "image" | "video"; errorCause?: string | null;
  provider?: string; attempts?: number;
  result?: { imageUrl?: string; videoUrl?: string };
  instruction?: string; updatedAt: string;
}
```

Both carry **current state, never a delta** (Decision 2): a page applies an event by replacing what it holds for that entity, so a duplicate delivery is a no-op and a missed one is superseded by the next. This is the contract US-18, US-19, US-21 and US-34 build against.

**Snapshot read** (Decision 4, the same endpoint `consult-session`'s (JOS-135) Decision 1 names as canonical): `GET /sessions/{sessionId}` returns `{ session, scenes: [...] }` in the exact same shapes — the resync a reconnecting page performs and the page's initial load go through one representation, never two that could drift apart.

**Stream address** (Decision 5): one stream per open session page, scoped by session identifier (`GET /events?sessionId=`), never a stream per scene and never one shared stream for all sessions.

## Catch-up Rule, Justified

**Resync, not replay** (Decision 3). Replay would require event identifiers, server-side retention and an eviction policy — and a backend restart, which §12.1 explicitly permits, is exactly when that retention is hardest to keep intact. The server already holds authoritative state (confirmed by `define-persistence`, JOS-181), which is what makes resync viable rather than merely convenient.

**Consequence, stated explicitly:** intermediate transitions that occur entirely within a disconnection window are never individually seen by a reconnecting page — proven live in the burst experiment, where a scene transitioning `submitted → image-generating → chunk-complete` while disconnected is seen only in its final state on reconnect. If a future story needs a complete transition history, it comes from `define-persistence`'s append-only stage-attempt records, not from this stream, which is deliberately not a log.

## Evidence

All required experiments were run **live** against the real, decided backend stack and store (not stand-ins), with full transcripts in `openspec/changes/define-live-updates/reports/`:

| Experiment | Result |
|---|---|
| Burst (~200 scenes, real retry/concurrency cadence) | **Proven.** All 200 accounted for, strict ascending order in the rendered UI despite wildly out-of-order completion. One real bug found — see § Risks. |
| Disconnect + catch-up | **Proven.** Genuine mid-flight kill; page reached correct state on reconnect, no manual reload. |
| Backend restart | **Proven.** Same run; `connectCount` 1→2 (one automatic reconnect); `resumed:1` on boot matched exactly the one truly in-flight scene. |
| Idle (scaled to 45s / 3 heartbeat intervals) | **Proven.** Connection never dropped through a quiet stretch; the eventual event still arrived correctly. |
| Snapshot cost at 200 scenes | **Proven cheap.** ~10ms per read including full HTTP round-trip — evidence *for* Decision 3/4, not against it. |
| Two tabs, same session (connection ceiling) | **Proven.** Two concurrent connections, no degradation, well under the 6-per-origin HTTP/1.1 ceiling (`define-backend-stack` task 1.4). |
| Cross-session isolation (AC22) | **Proven**, both via the browser (two tabs, two sessions, zero cross-talk) and via a held-open curl capture (zero occurrences of the other session's id). |

Also covered by automated tests (`prototype/test/useLiveSession.test.tsx`, 4 passing): duplicate-event idempotence, per-scene collapsing without cross-scene merging, the paused marker's independence from session state, and resync-on-every-reconnect.

## Real bugs found and fixed during this change

1. **CORS on the raw SSE response.** The `/events` route writes directly to `reply.raw`, bypassing Fastify's reply pipeline — `@fastify/cors`'s hook never ran, so the browser silently refused the cross-origin stream. Fixed by setting `Access-Control-Allow-Origin` explicitly before `writeHead`.
2. **Unknown session id opened a live-forever-empty stream** instead of being rejected — indistinguishable from a slow session. Fixed: `/events` now checks the session exists and returns 404 first.
3. **A lost delivery has no live recovery, only a restart does.** During the burst experiment, one scene's retry delivery (a `setTimeout` callback standing in for a provider webhook) silently never fired. The backend process stayed healthy throughout; nothing noticed until a manual replay resolved it instantly. **This is an orchestration-layer gap, not a live-update-transport gap** — once the state genuinely changed, SSE delivered it immediately and correctly. `define-backend-stack`'s reconciliation only runs at process boot; there is no periodic sweep of in-flight requests during a live process. This is exactly the failure mode PRD §10.1's per-phase maximum execution time is meant to catch, and that mechanism was already recorded as unproven in `docs/adr/0001-backend-stack.md`. Carried forward as a risk here and as a follow-up on the relevant implementation ticket.

## Dependence on stand-ins — closed

- **`define-backend-stack`'s push demonstration** (its own ADR's disposable-mechanism note) is now closed: SSE is the decided mechanism, proven independently on its own merits above, not inherited as a stand-in.
- **`define-frontend-stack`'s Decision 3 seam** (built before this mechanism was decided) is closed: the real contract above was implemented directly into the seam (`useLiveSession`), not a placeholder — see `openspec/changes/define-frontend-stack/design.md` § Execution Record §1.
- **`define-persistence`'s authoritative-store assumption**, which Decision 3 above rests on, is confirmed by `docs/adr/0002-persistence.md`.

## Risks left unproven within the timebox

- **The idle experiment ran for 45 seconds, not the ticket's suggested hour.** The mechanism under test (a heartbeat keeping an otherwise-idle stream alive) is time-scale-independent, so this is considered structurally sufficient, but a genuinely hour-plus idle stretch — closer to real proxy/OS idle-timeout territory — was not exercised.
- **No periodic recovery for a lost delivery while the process stays alive** (§ Real bugs found, item 3) — a real, encountered gap, not a hypothetical one, now an explicit risk for whichever story implements the real orchestration layer.
- **End-to-end latency** (design open question 3): no threshold is set — none exists yet (PRD §15 gap 9, US-41) — but it was observed to be sub-100ms from state change to a connected client receiving the SSE frame in every experiment run here (bounded well below any threshold the project might eventually set). Recorded as an observation, not a target this change invents.

## Consequences

- `docs/backend-standards.md` and `docs/frontend-standards.md` each gain a live-updates section describing this mechanism from their own side, written once and cross-referenced so the two cannot drift apart.
- Every story rendering live progress (US-18, US-19, US-21, US-34) builds against the event payload contract recorded here rather than inventing its own transport or field set.
