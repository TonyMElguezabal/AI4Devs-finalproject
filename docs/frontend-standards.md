---
description: Frontend development standards, best practices, and conventions for the Vid4You React/TypeScript/Vite application, covering stack, screen inventory, accessible-naming conventions for agent-driven E2E, live-update consumption, and testing
globs: ["frontend/src/**/*.{ts,tsx}", "frontend/test/**/*.{ts,tsx}", "frontend/tsconfig.json", "frontend/package.json", "frontend/vite.config.ts"]
alwaysApply: true
---

# Frontend Project Standards and Best Practices

## Table of Contents

- [Overview](#overview)
- [Technology Stack](#technology-stack)
- [Project Structure](#project-structure)
- [Screen Inventory](#screen-inventory)
- [Architecture: The Live-Update Seam](#architecture-the-live-update-seam)
- [Coding Standards](#coding-standards)
- [Accessible Naming Convention](#accessible-naming-convention)
- [Testing Standards](#testing-standards)
- [Development Workflow](#development-workflow)
- [Visual Design](#visual-design)
- [Not Yet Decided](#not-yet-decided)

---

## Overview

This document describes the frontend standards for Vid4You: a local, single-user React application rendering session progress, per-scene diagnostics, correction and download actions, driven live by the backend's push mechanism. It replaces the previous version, which described an unrelated inherited application's stack (React 18 / Create React App / Bootstrap 5 / Cypress) and referenced that application's own domain objects throughout — content with no bearing on this product, now fully removed.

The stack decision, its rejected alternatives, and the live evidence behind it are recorded in `docs/adr/0004-frontend-stack.md`. Read it before this document for the "why"; this is the "how." The live-update mechanism this frontend consumes is decided in `docs/adr/0003-live-updates.md`.

## Technology Stack

- **React 18** — chosen over a server-rendered-with-thin-client approach and a meta-framework (Next.js) after independently-scored evaluation (`docs/adr/0004-frontend-stack.md`) — not a default, not inherited.
- **TypeScript**, `strict: true` — per `docs/base-standards.md`'s project-wide "all code must be fully typed."
- **Vite** — build tooling and dev server; replaces the previous (inherited) Create React App, which is unmaintained.
- **Vitest + React Testing Library** — one test runner shared conceptually with the backend (`define-backend-stack` also uses Vitest), per `docs/base-standards.md`'s incremental-tooling preference. No Cypress — E2E verification for this project is agent-driven browser automation (see [Testing Standards](#testing-standards)), not a separate E2E framework.
- **No UI component library** (no Bootstrap or equivalent) — plain semantic HTML and CSS. This was a deliberate choice from the start, not an oversight, and held once visual design was actually decided (see [Visual Design](#visual-design)): plain markup is the safest default for agent-driven automation (fewer opaque, framework-owned DOM structures to work around). The accessible-naming convention below did not change when styling was applied, exactly as anticipated here.
- **No client-side router** — there is effectively one real page (the session view, reached by identifier) plus the start form; a router is unnecessary ceremony until the product-list gap (see [Not Yet Decided](#not-yet-decided)) is resolved and a second real route exists.

## Project Structure

```
frontend/
├── src/
│   ├── api/
│   │   ├── client.ts           # typed fetch wrappers, one per backend endpoint
│   │   └── useLiveSession.ts   # the ONE seam every view consumes live state through
│   ├── components/
│   │   ├── StartProjectForm.tsx
│   │   ├── SessionHeader.tsx
│   │   ├── SceneList.tsx
│   │   ├── SceneRow.tsx
│   │   └── FinalVideoDownload.tsx
│   ├── styles/
│   │   ├── tokens.css           # color/type design tokens (see Visual Design)
│   │   ├── app.css              # layout + per-status classes, consumes tokens.css
│   │   └── status.ts            # the one state→status-class mapping every component uses
│   ├── types.ts                 # mirrors the backend's wire contract (see Not Yet Decided)
│   └── App.tsx                  # identifier-based routing via a URL query param
├── test/
├── tsconfig.json
├── vite.config.ts
└── package.json
```

**`frontend/` now exists** — promoted from the proven prototype (`start-video-project`, JOS-134, extending `docs/adr/0004-frontend-stack.md` § Consequences' "kept as the project seed" decision), not a hypothetical target structure.

## Screen Inventory

Every screen traces to a PRD section; none was invented beyond what the PRD implies (full reasoning: `docs/adr/0004-frontend-stack.md` § Screen Inventory).

| Screen | PRD source | Key content |
|---|---|---|
| Start a project | §4.1, AC01 | Title, script, language selector limited to the hardcoded supported list; cannot start without a language |
| Session view | §8.1, §8.3, AC21 | Current session state, the failed phase and its actions, provider + attempts for session-level stages |
| Scene list | §6, §8.2, AC21 | Ascending scene-identifier order regardless of completion order, chunk state, results, errors, actions |
| Scene details | §3, §7.2, AC23 | `PROMPT`/`IMAGE`/`VIDEO`, narration interval, requested duration, speed factor + warning, provider + attempts |
| Correction form | §10.3, AC09 | Present only on a failed image or video stage; never exposes `ID`, `PROMPT`, or order |
| Pause / continue | §8.1, §9, AC07 | Session-level control; the paused marker shown on top of current state, distinct from a generation still running; `held` stages and counts shown in the header when paused; a held scene row shows "waiting for continue" (`pause-and-continue-session`, JOS-152) |
| Downloads | §12.3 | Per-scene image/clip during processing; final MP4 only at `final-video`; nothing offered for MP3, timestamps or generated texts |

**Recorded gap, not invented:** no project-list screen exists anywhere in the PRD or backlog (§12.3 describes reaching a session only by identifier) — see [Not Yet Decided](#not-yet-decided).

### The session page's address (`consult-session`, JOS-135, Decision 5)

The session view is reached at `?sessionId=<id>` — a query-string parameter, not a client-side route. This is a deliberate reuse of the existing address scheme (already bookmarkable, already "contains the identifier" per §12.3), not an oversight: a router is introduced only once a second real route exists, which this isn't (one conceptual page, reached by identifier). `SessionPage` is the presentational component for this address; it renders three states from its props alone — a populated session, the "not yet available" empty-scenes case (Decision 6), and the not-found case (an unknown *or* malformed identifier look identical here too, matching the backend's Decision 4) with a "Start a new project" action that clears the query param back to the start form.

## Architecture: The Live-Update Seam

Every view consumes live session state through exactly one hook, `useLiveSession(sessionId)` — never directly through `EventSource` or a raw `fetch`. This is deliberate: the live-update mechanism (`docs/adr/0003-live-updates.md`) can be swapped, extended, or reimplemented without touching a single view component, because every view's contract is `{ snapshot, connected, notFound, error }`, not "however this particular transport happens to work."

The hook owns three responsibilities that must never leak into views:
1. **Opening and maintaining the stream** (currently `EventSource` against `GET /events?sessionId=`).
2. **The catch-up rule**: resyncing the full snapshot (`GET /sessions/:sessionId`) on every `onopen` — which fires on the *first* connection **and** every automatic browser reconnect after a drop. A client that resyncs only once, at mount, can go stale forever after a dropped connection with no visible symptom — a real bug found and fixed during this stack's own development (`docs/adr/0001-backend-stack.md` § Evidence; `docs/adr/0003-live-updates.md` § "Real bugs found and fixed").
3. **Detecting a permanently unknown session** (`consult-session`, JOS-135, task 4.4): the backend rejects an unknown session's `/events` request with `404` *before* upgrading, so the stream never opens and the usual `onopen`-triggered fetch never runs — a naive implementation would show "connecting…" forever. The hook instead distinguishes a permanent failure (`EventSource.readyState === CLOSED`, which a non-2xx response produces with no browser auto-retry) from an ordinary drop after a prior successful connection (which the browser retries automatically), and sets `notFound` only for the former. This required no second `fetchSnapshot` call and no change to the existing resync-call-counting behaviour.

Every message and snapshot carries **current state, never a delta** (`docs/adr/0003-live-updates.md` Decision 2) — a component applies one by replacing what it holds for that entity, never by merging a partial update into previous state. This is what makes a duplicate or out-of-order delivery harmless to render.

## Coding Standards

Naming, typing, TDD and English-only rules are inherited from `docs/base-standards.md` and are not restated here.

- **Components**: PascalCase, one component per file, named for what it renders (`SceneRow`, not `SceneItem` or `Row`).
- **Files**: PascalCase for components (`SceneRow.tsx`), camelCase for everything else (`useLiveSession.ts`, `client.ts`).
- **State derivation, never duplication**: a component never stores its own copy of session/scene state in local `useState` and reconciles it against the live snapshot — it reads directly from the snapshot the seam hook returns. `SceneRow`'s only local state is UI-only (whether its details are expanded, the draft text in the correction textarea) — never a shadow copy of server truth.
- **Conditional rendering derives from state, never from a stored flag** (`docs/adr/0004-frontend-stack.md` Decision 4, proven in `test/components.test.tsx`): the correction form's presence is `scene.state === "failed"`, computed at render time — never a `canEdit` flag set once and left to drift out of sync with the state that actually governs it.
- **Scene actions are derived in one place, `sceneActions(scene)`** (`frontend/src/sceneActions.ts`; `show-scene-results-and-actions`, JOS-151, Decision 4). It maps `(state, affectedStage)` to which actions a scene offers (today: retry and image correction, only for a `failed` scene whose `affectedStage` is `image`), and `SceneRow` renders from it instead of testing `state === "failed"` itself. Adding or changing an action (the video-stage retry of JOS-158 is the next one) means extending this function and its tests, not adding a condition in a component. This refines the previous bullet: the presence of an action is still computed at render time, just not inline.

## Accessible Naming Convention

Fixed here as a documented convention, not left to per-story judgement (`docs/adr/0004-frontend-stack.md` Decision 5) — this is what keeps agent-driven E2E stable across stories written at different times, since every later story's automation depends on names earlier stories already established.

| Element | Accessible name pattern | Example |
|---|---|---|
| A scene row | `Scene {index}` (`aria-label` on the `<li>`) | `Scene 7` |
| Expand/collapse a scene's details | `View scene {index} details` / `Hide scene {index} details` | `View scene 7 details` |
| Retry a failed scene | `Retry scene {index}` | `Retry scene 7` |
| The correction form | `Correct scene {index} image instruction` (`aria-label` on the `<form>`) | `Correct scene 7 image instruction` |
| The correction textarea | `Corrected image instruction for scene {index}` | — |
| Per-scene downloads | `Download scene {index} image` / `Download scene {index} video` | `Download scene 7 image` |
| The final video download | `Download final video` | — |
| Session control | `Pause session` / `Continue session` | — |
| Start-form fields | Plain `<label htmlFor>` — `Title`, `Script`, `Language` | — |

**Never** a `data-testid` or other test-only attribute — every one of the names above is a real accessible name (`aria-label`, `<label>`, or the element's own text content), because the snapshot-based automation this project's mandatory E2E step uses reads the accessibility tree, and a test-only hook would let real accessibility rot while automation kept working. Verified directly: `test/components.test.tsx`'s "Accessible naming convention" suite, and every live E2E walkthrough in this project located its targets by name or role, never a coordinate guess.

## Testing Standards

```bash
npx tsc --noEmit   # fully-typed check
npx vitest run     # component + hook unit tests
npm run dev        # start the dev server for manual/E2E testing (fixed local URL, one command)
```

- **Component tests** (`test/components.test.tsx`): scene ordering (render order always derives from `index`, never array/arrival order), conditional editing, download gating, and the accessible-naming convention itself — so drift breaks a fast unit test here, not a slow E2E run in a later story.
- **Hook tests** (`test/useLiveSession.test.tsx`, from `define-live-updates`): the live-update seam tested against a controllable fake `EventSource`, never a real network connection — proving idempotent event application, per-scene state collapsing without cross-scene merging, the paused marker's independence from session state, and resync-on-every-reconnect.
- **E2E**: agent-driven browser automation against the real backend harness (`openspec/changes/define-backend-stack/skeleton`), locating every element through the accessibility tree. Playwright MCP is the tool `docs/openspec-tasks-mandatory-steps.md` names; if unavailable in a session, an equivalent agent-driven real-browser tool (e.g. Claude in Chrome) is an acceptable substitute for the same intent, stated explicitly in the report when substituted.

## Development Workflow

- Feature branches, descriptive English commit messages, small focused changes — per `docs/base-standards.md`.
- `npx tsc --noEmit` and `npx vitest run` must both pass before any commit touching the frontend.
- Every user-facing story follows this document's screen inventory and accessible-naming convention rather than inventing its own.

## Visual Design

Decided in `define-visual-design` (JOS-180 follow-up), resolving the deferral recorded in `docs/adr/0004-frontend-stack.md`. Two working mockups of the real session-view screen were built and product-owner reviewed before implementation; the chosen direction — **"Render Console"** — is a dark, monospace, pipeline-monitor aesthetic, deliberately fixed (no light-mode variant, no `prefers-color-scheme` adaptation).

- **Tokens**: `src/styles/tokens.css` — CSS custom properties for color (`--color-bg`, `--color-text`, `--color-muted`, `--color-border`, `--color-status-complete`, `--color-status-progress`, `--color-status-failed`, `--color-status-queued`) and type (`--font-mono`: `IBM Plex Mono` with a system-monospace fallback). Components style themselves against these tokens in `src/styles/app.css` — no component hardcodes a color or font literal.
- **Status encoding**: `src/styles/status.ts` exports `sceneStatusClass`/`sessionStatusClass`, the one shared mapping from every chunk state (6) and session state (8) to one of four status classes (`status-complete`, `status-progress`, `status-failed`, `status-queued`), rendered as a left-edge color bar plus matching text color. Status is **never color-only**: the existing text label (e.g. "chunk-complete", "failed — image generation", "— paused") is what a component already rendered before this change, and remains the primary signal; color is additive.
- **No UI component library**: unchanged from the original stack decision — plain CSS, no Bootstrap/MUI/Tailwind runtime.
- **No markup or accessible-name change**: this was a CSS-and-classname-only change over the prototype `define-frontend-stack` proved automatable. See `openspec/changes/define-visual-design/` for the full proposal, design rationale, and verification reports (unit tests, curl check, browser-driven E2E).

## Not Yet Decided

Tracked here so this document is never mistaken for settling more than it has:

- **Project-list screen** — no project-list screen exists in the PRD or backlog; §12.3 describes reaching a session only by identifier. This is a product decision for the owner, not a spike's to make (`docs/adr/0004-frontend-stack.md` § Screen Inventory). Built against identifier-based access meanwhile — the session's address, containing its identifier, is the bookmark.
- **Whether an OpenAPI-generated API client is used**, or types continue to be hand-mirrored from the backend's own `types.ts` (as they are today, documented explicitly as a manual-sync point in both files' headers) — deferred until the real backend's API surface is finalized (`define-backend-stack` task 1.3, `define-frontend-stack` task 12.2 is the ticket that would answer it for real).
- **A router**, if and when a second real route (e.g. a project list) exists.
