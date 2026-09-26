# ADR 0004 — Frontend framework and build tooling

- Status: Accepted
- Date: 2026-09-25
- Change: `define-frontend-stack` (JOS-180, US-42b)

## Context

PRD v1.3 describes the user-facing layer only through what it must show and how it must behave — never a technology. `docs/frontend-standards.md` documented a React 18 / Create React App / Bootstrap 5 / Cypress stack belonging to an unrelated inherited application, with 44 lines naming that application's domain objects and no mention of this product.

Two constraints make this harder than a default choice: the MVP sets no cap on script length, so a session can hold hundreds of independently-changing scenes; and this repository's own process requires an **agent**, not a person, to drive the finished UI through browser automation — making automatability a gate, not a preference.

## Decision

**React 18 + TypeScript + Vite**, consuming the live-update stream via the browser's native `EventSource` behind a single seam (Decision 3), confirmed on independently-scored merits (8.93 — see below), not by reflex.

**Documented fallback: Next.js** (8.23), activated only if React fails a must-pass gate (not triggered). Noted honestly: if a future failure is specifically about accessibility-tree automatability, the server-rendered candidate (which tied React on that exact criterion, at lower complexity) would be the more meaningful alternative, since Next.js shares React's rendering model.

**Not selected: server-rendered pages with a thin client layer** (7.93). A genuine, honestly-scored contender — see below — not a straw man.

## Must-Pass Gates

Renders the live-update push without a reload; drivable through the accessibility tree; starts from one documented command at a fixed local URL; fully typed; needs no auth layer. All three candidates (React SPA, server-rendered + thin client, Next.js) pass every gate — no candidate was eliminated here; all differentiation happened in scoring.

## Candidate Evaluation

| Criterion | Weight | React SPA | Server-rendered + thin client | Next.js |
|---|---|---|---|---|
| Live updates at scale | 25% | 9 | 7.5 | 8.5 |
| Agent automatability | 20% | 9 | 9 | 8.5 |
| Fit for screen inventory | 20% | 9 | 7.5 | 9 |
| Backend interop | 15% | 8.5 | 8 | 8 |
| Familiarity & maintenance cost | 10% | 9 | 6 | 7 |
| Local install simplicity | 10% | 9 | 9.5 | 7 |
| **Weighted total** | | **8.93** | **7.93** | **8.23** |

- **Live updates at scale:** React's virtual DOM plus keyed lists is a well-trodden path for hundreds of independently-updating rows; the server-rendered option needs hand-rolled DOM patching without a diffing layer.
- **The server-rendered candidate scored honestly, not dismissed** (per the ticket's own instruction): it genuinely wins local-install simplicity (served from the same Fastify process, no second port or build pipeline) and ties automatability. It loses specifically on screen fit and scale ergonomics — deriving the correction form's availability from stage state (Decision 4) is a natural fit for a component's render function, and considerably more hand-written imperative glue to enforce equivalently in patched-DOM code.
- **Familiarity & maintenance cost:** scored from repository evidence, consistent with how `define-backend-stack` scored the same criterion — the inherited (now-replaced) `docs/frontend-standards.md` template happened to describe React, alongside React's broader ubiquity. Nothing in the repo evidences the other two.
- **Local install simplicity:** Next.js scores lowest — its own dev server, routing conventions and config surface are overhead for an app with essentially one real page type and no SEO or multi-tenancy need.

## Screen Inventory

Every screen traces to a PRD section (no screen was invented): start-a-project (§4.1, AC01), session-by-phase view (§8.1, §8.3, AC21), scene list (§6, §8.2, AC21), scene details (§3, §7.2, AC23), correction form (§10.3, AC09), pause/continue (§8.1, §9, AC07), downloads (§12.3). Full table: `design.md` § Execution Record §2.

**Recorded product gap, not invented:** no project-list screen exists anywhere in the PRD or backlog (§12.3 describes reaching a session only by identifier). The prototype is built against identifier-based access (the session's address is the bookmark, matching `consult-session`'s Decision 5); this is a product decision for the owner, not this spike's to make.

## Evidence

Every required experiment was run **live**, largely by extending `define-live-updates` (JOS-183)'s own sessions against this same prototype rather than duplicating them:

| Experiment | Result |
|---|---|
| Scale (~200 scenes, real retry/concurrency cadence) | **Proven.** Strict ascending DOM order confirmed despite wildly out-of-order completion; no reload. |
| Reconnect (disconnect + backend restart) | **Proven.** Genuine mid-flight kill; one automatic browser reconnect; correct recovery, no manual reload. |
| Conditional editing | **Proven** live and unit-tested (`test/components.test.tsx`): present only on a failed scene, never exposes id/prompt/order. |
| Download gating | **Proven** live and unit-tested: per-scene links gated on `chunk-complete`, final video gated on `final-video`. |
| Agent-driven walkthrough | **Proven** — every interaction located through the accessibility tree (`find`), never a coordinate guess or test-only selector. |

Also covered by 8 new component tests (`test/components.test.tsx`) plus the 4 live-update tests `define-live-updates` added (`useLiveSession.test.tsx`) — 12 passing in total.

**Virtualisation (design open question 3), answered from evidence:** **not needed.** 200 plain rows re-rendered responsively through ~317 live SSE messages during the burst experiment with no observed jank. Revisit only if real usage meaningfully exceeds this scale.

## Real findings during this change

1. **A genuinely useful, non-blocking gap:** the backend returns `scene.result` (the artefact's relative path), but the prototype's UI never reads it — download links are built from `sessionId`/`sceneId` alone. Harmless today (the server re-validates state regardless of what the client sends) but worth wiring up directly if this becomes real. See `reports/2026-09-25-step-8-curl-endpoint-testing.md`.
2. Two CORS/routing bugs found while building the shared contract (raw-SSE-response CORS header, unknown-session-id stream rejection) are `define-live-updates`'s findings, not this change's own — recorded there (`docs/adr/0003-live-updates.md`) and not duplicated here.

## Dependence on stand-ins — closed

This change was built **after** `define-live-updates` had already decided its mechanism and contract (not before, as the original ticket anticipated) — see `design.md` § Execution Record §1. The Decision 3 seam (`useLiveSession`) was implemented directly against the real SSE contract from the start; there was never a placeholder to close.

## Risks left unproven within the timebox

- **The project-list gap** (§ Screen Inventory) is a product decision for the owner, not resolved by this spike.
- **`scene.result` is unused by the UI** (§ Real findings) — noted as a real, if minor, prototype gap rather than left silent.
- **Visual/UI design was explicitly deferred** by the product owner during this session ("we can come back to the UI design later") — the prototype was intentionally plain, unstyled semantic HTML, chosen for automation stability over appearance. This was a stated decision, not an oversight. **Resolved in `define-visual-design`** (JOS-180 follow-up): the product owner reviewed two working mockups of the real session-view screen and chose a direction ("Render Console"); see `docs/frontend-standards.md` § Visual Design. That change confirmed the automation-stability property held: the accessible-naming convention and DOM structure this ADR's evidence proved automatable were unchanged by applying the styling.

## Consequences

- `docs/frontend-standards.md` is rewritten (this change) to describe this stack, replacing the inherited template, and includes the live-updates section `define-live-updates` deferred pending this rewrite.
- Every user-facing story (US-18, US-19, US-21, US-25, US-26, US-31, US-32) builds against the screen inventory, accessible-naming convention, and live-update contract recorded here, rather than choosing its own technology.
