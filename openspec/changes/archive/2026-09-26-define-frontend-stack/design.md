# Design — Define the frontend stack

## Context

The PRD describes the user-facing layer only through what it must show. A section per phase with the session's current state, the failed phase and its actions (§8.3). Scenes in ascending ID order regardless of completion order (§6). Per-scene state, results, errors and applicable actions (§8.2, §8.3). Scene details carrying `PROMPT`, `IMAGE`, `VIDEO`, narration interval, requested duration, speed factor and its warning (§3, §7.2). Correction of the two visual instructions offered only on a failed stage (§10.3). A session-level pause whose marker sits on top of the current state and reads differently from a generation still running (§9). Per-scene downloads during processing and the final MP4 only at `final-video`, with no download for the MP3, timestamps or texts (§12.3). A session reached by identifier, showing only its own data (§12.3). All of it updating without a reload (§8.3).

No technology is named. `docs/frontend-standards.md` documents a React 18 / Create React App / Bootstrap 5 / Cypress stack for a different application — 531 lines, 44 of which name that application's domain objects, none of which mention this product. It is not a starting point to adapt; it is content to replace.

Three couplings matter. `define-live-updates` (JOS-183) chooses the push mechanism this change only consumes. `define-backend-stack` (JOS-179) rules on whether the TypeScript signal in the Definition of Done is binding, and whether an OpenAPI-generated client exists. And `docs/openspec-tasks-mandatory-steps.md` Step N+3 requires an **agent**, not a person, to drive the finished UI through Playwright MCP — which turns automatability into a gate.

## Goals / Non-Goals

**Goals:**
- Record the screen inventory the PRD implies, so implementation stories inherit it rather than each deriving it.
- Choose the framework and build tooling, judged against live updates at scale, agent automatability, and the conditional-editing rules.
- Prove the choice at the scene counts the MVP actually permits.
- Fix the accessibility and naming conventions that keep agent-driven E2E stable.
- Replace `docs/frontend-standards.md` with this product's standards.

**Non-Goals:**
- Implementing any user-facing story; this change decides what they will be built on.
- Choosing the live-update mechanism (JOS-183) — consumed here, not decided.
- Re-opening the TypeScript ruling, which is JOS-179's to make.
- Visual design, branding or a design system, none of which the PRD specifies.
- Inventing the missing project-list screen (see Open Questions).

## Decisions

**Decision 1 — Treat agent automatability as a must-pass gate, not a weighted criterion.**
A candidate whose output an agent cannot reliably drive through the accessibility tree is eliminated regardless of its other merits.
*Alternatives:* scoring it alongside ergonomics and ecosystem (rejected: Step N+3 makes agent-driven E2E the project's mandatory verification path, so a stack that fails it cannot satisfy the process on any story — that is a gate, and scoring it would let a strong candidate pass while leaving every future story unverifiable).

**Decision 2 — Size the scale experiment from the PRD's own absence of a limit, at roughly 200 scenes.**
*Alternatives:* testing a handful of scenes (rejected: §4.1 sets no cap on script length, so hundreds of scenes are permitted, not hypothetical — and the scene list is where a naive rendering approach fails; discovering that during US-19 means rebuilding it); testing thousands (rejected: beyond what a narrated script plausibly produces, so it would trade a real risk for an invented one).

**Decision 3 — Keep the push connection behind one boundary in the prototype.**
The page consumes state changes through a single seam, so JOS-183's eventual mechanism can be swapped without touching the views.
*Alternatives:* wiring the transport directly into components (rejected: JOS-183 may not have settled when this runs, and every view would then encode an assumption that change could invalidate).

**Decision 4 — Derive the correction form's availability from stage state, never from a stored flag.**
The form exists when the stage is `failed` and does not exist otherwise; `ID`, `PROMPT` and order are never rendered as inputs.
*Alternatives:* rendering the fields always and disabling them on success (rejected: §10.3 and AC09 say the action is not offered, and a disabled input is still present in the DOM, still visible, and one bug away from being submitted); a flag deciding editability (rejected: it can drift out of step with the state that actually governs it).

**Decision 5 — Fix accessible roles and names as a documented convention, not per-story judgement.**
Each phase section, scene row, scene detail field and action gets a stable, predictable accessible name recorded in the standards.
*Alternatives:* letting each story name its own elements (rejected: every story's E2E step depends on the previous story's naming, so drift breaks tests written earlier); test-only selector attributes (rejected: they keep automation working while letting real accessibility rot, and the snapshot path Playwright MCP uses reads the accessibility tree anyway).

**Decision 6 — Render scene order from the scene identifier, not from arrival order.**
*Alternatives:* appending scenes as their updates arrive (rejected: §6 and AC21 require ascending ID order regardless of completion order, and scenes demonstrably complete out of order — this is the normal case, not an edge case).

**Decision 7 — Reuse the harnesses from `define-backend-stack` and `define-live-updates` rather than building a third.**
*Alternatives:* a standalone mock server (rejected: it would prove the UI against a fiction rather than against the backend it must actually consume, and would duplicate the stub provider a third time).

## Risks / Trade-offs

- **JOS-183 has not settled when this runs** → Keep the push behind the Decision 3 seam, run against a stand-in, and record in the ADR which observations depend on it — the same discipline `define-backend-stack` applied to its persistence stand-in.
- **The scale experiment passes on stubbed data but fails on real timing** → Drive updates at a rate and concurrency drawn from the retry and request-limit rules (§10.1, §11), not at a comfortable cadence.
- **A server-rendered candidate is dismissed by reflex** → For a local, single-user, no-auth tool with a server already pushing state, it is a serious contender. Score it honestly; record the reason if it loses.
- **The standards rewrite inherits structure from the template** → The existing file's *shape* is reusable, its content is not. Verify no inherited domain object survives, rather than editing around them.
- **Conventions are written but not followed** → Decision 5 is worthless unless the E2E experiment actually exercises it; task group 6 proves the conventions on the prototype before they are written down as standards.
- **The missing project-list screen surfaces mid-implementation** → Record it now as a product gap with an owner, and build against identifier-based access, so the decision is visible rather than silently made by whoever builds the first screen.

## Migration Plan

Nothing is deployed and no UI exists, so there is no migration. Rollback is discarding the prototype; task group 11 decides explicitly whether it becomes the project seed or is thrown away, rather than letting a throwaway drift into production by default.

## Open Questions

1. **How does a user find their sessions?** §12.3 describes reaching a session by identifier, and no project-list screen appears in the PRD or the backlog. This is a product decision for the owner, not a spike's to make — recorded here, built against identifier-based access meanwhile.
2. **Is an OpenAPI-generated client available?** Follows from `define-backend-stack`; decides whether the frontend hand-writes its API types.
3. **Does the scene list need virtualisation at the sizes the experiment reveals**, or does plain rendering hold? Answer from the evidence rather than adding complexity in advance.

## Execution Record (2026-09-25)

### §1 — Inputs collected

- **TypeScript ruling (1.1):** taken as decided, not re-opened. `define-backend-stack` task 1.2 found no binding external "TypeScript Definition of Done," but Node/TypeScript was still chosen on its own merits (`docs/adr/0001-backend-stack.md`), and `docs/base-standards.md`'s "all code must be fully typed" applies project-wide regardless. TypeScript is the input here.
- **Live-update mechanism (1.2):** `define-live-updates` (JOS-183) has **decided** the mechanism (SSE) and its full event contract (`SessionEvent`/`SceneEvent`, the snapshot-read shape — `openspec/changes/define-live-updates/design.md` § Execution Record §3–§4), but had not yet implemented it in the skeleton when this change started (22/89 tasks done, analysis-only). Rather than build the prototype against a third, unrelated stand-in, this change **implements JOS-183's already-decided contract into the `define-backend-stack` skeleton** as part of task 4.2 ("point it at the harness rather than a third mock server") — the same concrete work that satisfies JOS-183 task 6.1 ("extend the skeleton with the chosen mechanism"). This is recorded as shared, cross-change progress in both changes' `tasks.md`, not duplicated effort. The frontend prototype therefore consumes the **real decided contract**, not a placeholder — a stronger position than task 1.2 anticipated ("record that it is unsettled and a stand-in will be used").
- **OpenAPI-generated client (1.3):** the skeleton already generates OpenAPI via `@fastify/swagger` (`docs/adr/0001-backend-stack.md`). A generated TypeScript client (e.g. `openapi-typescript`) is available in principle; this change answers definitively in task 12.2 once the prototype's actual API surface is finalized, rather than committing to generation machinery before the surface is known.
- **What remains undecided (1.4):** the real persistence engine (US-42c) and the real backend project structure (`backend/`, deferred to JOS-186) — neither blocks a frontend prototype run against the proven skeleton.

### §2 — Screen inventory

Every screen traces to a PRD section (task 2.8); no screen is invented beyond what the PRD implies.

| # | Screen / area | PRD source | Key content |
|---|---|---|---|
| 2.1 | Start a project | §4.1, AC01 | Title, script, language selector limited to the hardcoded supported-language list; cannot start without a language; no provider called before start |
| 2.2 | Session-by-phase view | §8.1, §8.3, AC21 | One section per phase, the session's current state, the failed phase with its error and actions, provider + attempts for session-level stages |
| 2.3 | Scene list | §6, §8.2, AC21 | Ascending scene-identifier order regardless of completion order, chunk state, available image/clip, errors, actions |
| 2.4 | Scene details | §3, §7.2, AC23 | `PROMPT`, `IMAGE`, `VIDEO`, narration interval, requested duration, speed factor + warning, provider + attempts per stage |
| 2.5 | Correction form | §10.3, AC09 | Present only on a failed image or video stage; limited to that one instruction; never exposes `ID`, `PROMPT` or order |
| 2.6 | Pause / continue | §8.1, §9, AC07 | Session-level control; the paused marker shown on top of current state, distinct from a generation still running |
| 2.7 | Downloads | §12.3 | Per-scene image/clip during processing; final MP4 only at `final-video`; nothing offered for MP3, timestamps or generated texts |

**Recorded gap, not invented (2.8):** no project-list screen exists anywhere in the PRD or backlog (§12.3 describes reaching a session only by identifier). This is a product decision for the owner (`proposal.md` § Impact), not this spike's to make. The prototype is built against identifier-based access (a session's address contains its identifier, matching `consult-session`'s Decision 5), and this gap is carried into the ADR (task 10.4) and a follow-up item (task 12.3).

### §3 — Candidate evaluation

**Must-pass gates** (renders the push without reload; drivable via the accessibility tree; one documented start command at a fixed URL; fully typed; no auth layer):

| Candidate | Renders push, no reload | Accessibility-tree drivable | One start command | Fully typed | No auth needed | Result |
|---|---|---|---|---|---|---|
| SPA (React + TypeScript) | Pass | Pass | Pass | Pass | Pass | **Admitted** |
| Server-rendered + thin client (on Fastify) | Pass — client JS patches the DOM on each SSE event, no navigation | Pass — arguably the most naturally semantic of the three | Pass | Pass | Pass | **Admitted** |
| Meta-framework (Next.js) | Pass | Pass | Pass | Pass | Pass | **Admitted** |

No candidate eliminated at the gate — all three can, in principle, satisfy every gate. Differentiation happens entirely in scoring, as in `define-backend-stack` and `define-live-updates`.

**Weighted scoring:**

| Criterion | Weight | React SPA | Server-rendered + thin client | Next.js |
|---|---|---|---|---|
| Live updates at scale | 25% | 9 | 7.5 | 8.5 |
| Agent automatability | 20% | 9 | 9 | 8.5 |
| Fit for screen inventory | 20% | 9 | 7.5 | 9 |
| Backend interop | 15% | 8.5 | 8 | 8 |
| Familiarity & maintenance cost | 10% | 9 | 6 | 7 |
| Local install simplicity | 10% | 9 | 9.5 | 7 |
| **Weighted total** | | **8.93** | **7.93** | **8.23** |

- **Live updates at scale:** React's virtual DOM plus keyed lists is a well-trodden path for hundreds of independently-updating rows. The server-rendered option is fully capable but needs hand-rolled DOM patching without a diffing layer, requiring more care to avoid janky whole-section re-renders under a burst. Next.js scores close to the SPA (same React runtime once hydrated), dinged only for hydration being an irrelevant extra layer here.
- **Fit for screen inventory (server-rendered scored honestly, not dismissed, per task 3.4):** it genuinely wins local-install simplicity and ties on automatability — a serious contender, not a straw man, exactly as the ticket asks. It loses specifically on screen fit and scale ergonomics: Decision 4 ("derive the correction form's availability from stage state, never a stored flag") is a natural fit for a component's render function, and considerably more hand-written imperative glue to enforce equivalently in patched-DOM code.
- **Familiarity & maintenance cost:** scored from repository evidence, consistent with how `define-backend-stack` scored this criterion — the *inherited* (and now-replaced) `docs/frontend-standards.md` template happened to describe React, a weak-but-real signal alongside React's broader ubiquity; nothing in the repo evidences the other two.
- **Local install simplicity:** the server-rendered option genuinely wins here — served from the same Fastify process as the API, it needs no second port, build pipeline or dev server at all. Next.js scores lowest: its own dev server, routing conventions and config surface are overhead for an app with essentially one real page type and no SEO or multi-tenancy need (`design.md` Risk: "weigh whether its routing and server features earn their weight").

**Decision: React 18 + TypeScript + Vite**, consuming the SSE stream via the browser's native `EventSource` (no extra push library needed) behind the Decision 3 seam, and Vitest + React Testing Library for component tests — one test runner shared with the backend (`define-backend-stack` already uses Vitest), per `docs/base-standards.md`'s incremental-tooling preference.

**Documented fallback: Next.js** — the next-highest score (8.23), activated only if React fails a must-pass gate during the experiments (not triggered — see § Evidence below). Noted honestly: if a future failure is specifically about accessibility-tree automatability rather than scale, the server-rendered option (which tied React on that exact criterion, at genuinely lower complexity) would be the more meaningful alternative to reach for, since Next.js shares React's rendering model and would not obviously fix an automatability problem React itself has. The runner-up-by-score and "most meaningful alternative for a given failure mode" are not automatically the same candidate, and this is recorded rather than glossed over.

### §5 — Experiments (2026-09-25)

Every required experiment (scale, reconnect, conditional editing, download gating) was run **live** using this prototype — largely by reusing `define-live-updates` (JOS-183)'s own experiment sessions against the same running frontend, rather than duplicating them, since both changes share one prototype and one backend harness.

- **Scale (200 scenes) and reconnect:** proven in `openspec/changes/define-live-updates/reports/2026-09-25-step-7-live-experiments.md` §7.1–7.4, using this exact prototype. No dependence on a live-update stand-in — by the time this change's experiments ran, JOS-183's SSE contract was already the real, decided mechanism, not a placeholder (task 1.2).
- **Virtualisation (open question 3), answered from evidence:** **not needed.** 200 plain `<li>` rows correctly re-rendered through roughly 317 live SSE messages during the burst with no observed jank, dropped frames, or unresponsive input. At the scale this MVP actually targets (a narrated script's worth of scenes, not an arbitrary large list), plain rendering holds. Revisit only if a future story's real usage meaningfully exceeds this.
- **Conditional editing and download gating:** proven live (the correction-form and pause/continue walkthroughs earlier in this session) and now covered by repeatable unit tests (`test/components.test.tsx`, task 6.2) so the behaviours don't rely on a one-off demonstration.
- No must-pass gate failed; the documented fallback (Next.js) was not triggered.
