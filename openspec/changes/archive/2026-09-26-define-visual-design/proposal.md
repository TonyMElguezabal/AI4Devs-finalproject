# Define and apply the frontend visual design

Linear-Issue: JOS-180 (follow-up)

## Why

`define-frontend-stack` (JOS-180) deliberately shipped the frontend prototype as plain, unstyled semantic HTML: "visual design was explicitly deferred by the product owner during this session ('come back to the UI design later')" (`docs/adr/0004-frontend-stack.md`, `docs/frontend-standards.md` § Not Yet Decided). That deferral is now being picked up. The product owner has reviewed concrete mockups of the real session-view screen in two distinct directions and chosen one — a dark, monospace, pipeline-monitor aesthetic ("Render Console") over a light, paper/screenplay aesthetic ("Script Page"). Both mockups are recorded at `https://claude.ai/artifact/Cj37mJMiWxvag4H7LLkf1Z` for reference.

Without this change, every implementation story (US-18, US-19, US-21, US-25, US-26, US-31, US-32) would otherwise invent its own styling ad hoc, producing an inconsistent UI the same way an unset frontend stack would have.

## What Changes

- Record the decided visual direction as a small, explicit design-token set (color palette, typography, status-encoding convention) rather than leaving styling to per-story judgement.
- Apply that token set to the existing prototype (`openspec/changes/define-frontend-stack/prototype/`) across the full screen inventory: start-project form, session view (including the paused marker), scene list, scene details, correction form, pause/continue control, downloads.
- **Styling only — no markup, structure, or behavior change.** The accessible-naming convention and DOM structure `define-frontend-stack` already proved automatable are preserved exactly; this change must not regress agent-driven E2E.
- Status (chunk/session state) is encoded with both color **and** text, never color alone — the left-edge color bar is a reinforcing cue, not the only signal.
- Update `docs/frontend-standards.md` § Not Yet Decided to record this decision, leaving the still-open items (project-list screen, OpenAPI client) untouched.
- No new ADR-scored decision process — the direction was already decided by the product owner against real mockups; this change documents and implements that decision, it does not re-litigate it.

## Capabilities

### New Capabilities

- `visual-design`: the guarantees this change establishes about the frontend's visual layer — one documented token set (color, type, status encoding), applied consistently across every screen, without regressing the accessibility contract `frontend-foundation` already established.

### Modified Capabilities

None. `openspec/specs/` is still empty — `frontend-foundation` (from `define-frontend-stack`) is not yet archived, so it is not an existing spec this change can modify. This change's requirements build on top of it without altering it.

## Impact

- **Documentation**: `docs/frontend-standards.md` § Not Yet Decided updated; a short "Visual Design" section added describing the token set and where it lives in code (not a new numbered ADR — this is a recorded product decision, not a scored engineering trade-off).
- **Code**: the prototype at `openspec/changes/define-frontend-stack/prototype/` gains a stylesheet (or equivalent) applying the tokens; no component markup restructuring.
- **Dependency on `define-frontend-stack` (JOS-180)**: this change styles that prototype in place; it assumes that change's screen inventory and accessible-naming convention as fixed inputs, not open questions.
- **Verification**: must re-run the accessible-naming and conditional-editing checks after styling to confirm no regression, per `docs/openspec-tasks-mandatory-steps.md`.
- **No deployed systems, external APIs, or user data are affected.**
