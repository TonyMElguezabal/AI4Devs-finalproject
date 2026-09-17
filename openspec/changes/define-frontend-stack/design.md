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
