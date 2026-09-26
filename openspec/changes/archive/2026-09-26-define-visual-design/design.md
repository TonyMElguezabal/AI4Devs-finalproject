## Context

`define-frontend-stack` (JOS-180) chose React 18 + TypeScript + Vite and built a real prototype against the decided live-update contract, but deliberately shipped it as plain, unstyled semantic HTML — visual design was out of scope for that spike (`docs/adr/0004-frontend-stack.md`).

Two concrete visual directions for the same real screen (session view: per-phase state, 8 scenes across all 6 chunk states, the failed-only correction form, the paused marker, download gating) were built as an Artifact (`https://claude.ai/artifact/Cj37mJMiWxvag4H7LLkf1Z`) and reviewed by the product owner:

- **"Script Page"**: light, paper background, Courier Prime, screenplay/continuity-sheet vernacular.
- **"Render Console"**: dark, `#14161A` background, IBM Plex Mono, pipeline-monitor vernacular, status shown via a left-edge color bar per row.

The product owner chose **Render Console**. This document records how that direction becomes code without disturbing the accessibility contract `define-frontend-stack` already proved automatable (Decision 5 of `docs/adr/0004-frontend-stack.md`: accessible names for phase sections, scene rows, detail fields and actions).

## Goals / Non-Goals

**Goals:**
- One documented, reusable token set (color, type, spacing scale for status rows) that every screen in the inventory draws from — not per-component ad hoc styling.
- Status (session state, chunk state, paused) always readable from text content, with color as a reinforcing, non-exclusive cue.
- Zero change to DOM structure, element roles, or the accessible-naming convention in `docs/frontend-standards.md` § Accessible Naming Convention — this is a CSS-layer change.
- Stay within "no UI component library" (`docs/frontend-standards.md` § Technology Stack) — plain CSS, no Bootstrap/MUI/Tailwind runtime dependency.

**Non-Goals:**
- Resolving the project-list screen or OpenAPI-client open questions (`docs/frontend-standards.md` § Not Yet Decided) — untouched by this change.
- A theme switcher (light/dark toggle) or respecting `prefers-color-scheme` — the product owner picked one fixed direction for this local single-user tool, not an adaptive theme.
- Redesigning the screen inventory or information architecture — the seven screens and their content stay exactly as `define-frontend-stack` specified them.
- Iconography, illustration, or a logo — out of scope; text and the existing semantic elements only.

## Decisions

**1. Tokens as CSS custom properties in one file, not inline styles or a CSS-in-JS library.**
A new `src/styles/tokens.css` defines the palette (`--color-bg`, `--color-text`, `--color-muted`, `--color-border`, `--color-status-complete`, `--color-status-progress`, `--color-status-failed`, `--color-status-queued`) and type (`--font-mono`, three font-size steps). Components reference these via class names in a small `src/styles/app.css`, not per-element `style={{...}}` — the mockups used inline styles for artboard portability, but the real implementation follows the existing React convention (co-located, class-based styling) rather than duplicating the mockup's authoring format. Rejected: a CSS-in-JS library (styled-components, emotion) — an unjustified new dependency for a single fixed theme with no runtime theming need.

**2. Status color is derived from state in one place, mirroring the existing "conditional rendering derives from state" rule.**
A single mapping (e.g. `src/styles/status.ts`: `STATE_TO_CLASS: Record<ChunkState | SessionState, string>`) maps each of the 6 chunk states and 8 session states to a CSS class carrying both the left-edge bar color and the text color. Components look up this mapping at render time from `scene.status` / `session.state` — never a locally stored "this row is red" flag — consistent with `docs/frontend-standards.md` § Coding Standards' existing rule against stored derived flags. Rejected: per-component inline color literals — would duplicate the mapping across `SceneRow`, `SessionHeader`, and any future consumer, and drift is exactly the failure mode that rule already exists to prevent.

**3. Color is never the only signal.**
Every status row keeps its existing text label (e.g. "chunk-complete", "failed — image generation") alongside the color bar. This was already true of the unstyled prototype (text was the *only* signal); this change adds color as a second, reinforcing channel, so a color-vision-deficient user loses nothing relative to today's build. Verified computationally (WCAG relative-luminance contrast formula, not eyeballed) for all four status colors against `#14161A`: two of the mockup's original values needed adjustment before implementation — failed-red from `#C1524A` (too low) to `#D6635A` (5.00:1), and queued-grey from `#5B6068` (2.86:1, a real gap the mockup comparison didn't catch since it was never computed there) to `#848994` (5.16:1). See `openspec/changes/define-visual-design/tasks.md` task 9.1 for the full computed table.

**4. Fixed dark theme, no `prefers-color-scheme` media query.**
The product owner selected a specific dark aesthetic as a deliberate identity for this tool, not a default; adding a light variant now would mean designing and maintaining a second, un-reviewed direction no one asked for. If a light mode is wanted later, it is a new decision, not an automatic corollary of this one.

**5. Google Fonts (`IBM Plex Mono`) loaded via a single `<link>`, no self-hosting.**
This is a local single-user dev tool, not a privacy-sensitive public product, so a CDN font request at load time is an acceptable trade-off against the maintenance cost of vendoring font files. Revisit only if the app ever needs to run fully offline.

## Risks / Trade-offs

- **[Risk]** A future contributor adds a new status color inline instead of extending the `STATE_TO_CLASS` mapping, reintroducing drift. → **Mitigation**: the component test suite (`test/components.test.tsx`) already asserts accessible names per state; extend it to assert the status class name too, so a hardcoded inline color that skips the mapping fails a fast unit test.
- **[Risk]** Monospace-only type at small sizes (11–12px, per the approved mockup) may read as dense on lower-resolution displays. → **Mitigation**: this is a data-dense professional tool by design (F6: hundreds of scenes must stay responsive and legible at once); the type scale keeps a 12px floor and 1.4+ line-height, matching what was already reviewed and approved in the mockup, not a smaller untested size.
- **[Risk]** Loading a Google Font blocks first paint briefly. → **Mitigation**: `font-display: swap` in the `<link>`'s stylesheet (Google Fonts serves this by default for `css2` requests) and a system-monospace fallback (`ui-monospace, 'SF Mono', Menlo, monospace`) in the `font-family` stack, so text is never invisible while the font loads.

## Migration Plan

Purely additive: the prototype currently ships zero CSS, so this change adds `src/styles/tokens.css`, `src/styles/app.css`, `src/styles/status.ts`, imports them from `src/main.tsx`, and adds class names to existing components without changing their markup, props, or the seam hook (`useLiveSession`). No data migration, no API change, no rollback beyond reverting the stylesheet import and class-name additions.

## Open Questions

None outstanding — the visual direction, palette, and typography were settled by product-owner review of working mockups before this document was written (see Context).
