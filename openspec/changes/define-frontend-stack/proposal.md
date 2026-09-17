# Define the frontend stack

Linear-Issue: JOS-180

## Why

PRD v1.3 is silent on implementation technology, so every user-facing story — US-18, US-19, US-21, US-25, US-26, US-31, US-32 — would otherwise pick its own framework. `docs/frontend-standards.md` cannot fill the gap: its 531 lines document a React 18 / Create React App / Bootstrap / Cypress stack belonging to a different application, with 44 lines naming that application's domain objects and not one mention of this product.

Two constraints make the choice harder than a default: the MVP sets no cap on script length, so a session can hold hundreds of scenes whose states change independently and live; and this repository's own process requires an **agent** to drive the finished UI through Playwright MCP, which makes automatability a gate rather than a preference.

## What Changes

- Establish the must-pass gates: renders the US-42e push without a reload, drivable through the accessibility tree, starts from one documented command at a fixed URL, fully typed, needs no auth layer.
- Evaluate the candidate classes — component-framework SPA, server-rendered pages with a thin client layer, and meta-framework — and score the survivors.
- Prototype the leading candidate against the existing stubbed harness, and prove it at roughly 200 scenes under rapid concurrent state changes.
- Prove connection loss and backend restart recover current state in an open page without the user reloading.
- Prove the correction form appears only on a failed stage and never exposes `ID`, `PROMPT` or scene order.
- Prove an agent can drive the whole flow through Playwright MCP and file the mandatory report.
- Fix the accessibility and naming conventions that keep that automation stable, as a standard rather than a per-story habit.
- **Rewrite `docs/frontend-standards.md`** so it describes this product.
- Record the screen inventory the PRD implies, so implementation stories inherit it.
- No product behaviour ships, and no user-facing capability changes.

## Capabilities

### New Capabilities

- `frontend-foundation`: the guarantees this change establishes about the user-facing layer — a single documented stack, a UI that stays responsive at the scene counts the MVP permits, conventions that keep agent-driven E2E stable, and recorded evidence before implementation begins.

The product behaviours this change's prototype exercises remain owned by their own stories and will be specified there: US-18 and US-19 (progress by phase and by scene), US-21 (paused distinguishable from running), US-25 and US-26 (correction on failure only), US-31 and US-32 (downloads).

### Modified Capabilities

None. `openspec/specs/` is still empty. The `backend-foundation` and `persistence-foundation` capabilities introduced by `define-backend-stack` and `define-persistence` are not yet archived, so they are not existing specs this change can modify; all three must stay consistent.

## Impact

- **Documentation**: `docs/frontend-standards.md` rewritten end to end; a new ADR.
- **Process**: `docs/openspec-tasks-mandatory-steps.md` Step N+3 requires the agent to drive the UI itself through Playwright MCP. This change owns making that possible — a stack whose output an agent cannot reliably drive fails a gate, however good it is otherwise.
- **Dependency on `define-live-updates` (JOS-183)**: this change *consumes* the push mechanism and does not choose it. If that spike has not settled, the prototype runs against a stand-in and the ADR must say which observations depend on it.
- **Dependency on `define-backend-stack` (JOS-179)**: the TypeScript ruling from its task 1.2 is an input here, not a question to re-open. Whether an OpenAPI-generated client is available also follows from that change.
- **Downstream tickets**: unblocks every user-facing story in E1–E9.
- **Scale risk**: with no cap on scenes, the list is the component most likely to fail late. This change proves it early rather than discovering it during US-19.
- **Open product question, not a spike decision**: the PRD never says how a user finds their sessions. §12.3 describes reaching a session by identifier, and no project-list screen appears anywhere in the PRD or the backlog. Either users keep identifiers themselves or a screen is missing. This change records the gap and builds against identifier-based access; it does not invent the screen.
- **No deployed systems, external APIs or user data are affected.** The prototype runs against stubbed data, so no credentials are exercised.
