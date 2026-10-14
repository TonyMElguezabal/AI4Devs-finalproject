# Redesign the frontend visual design ("Studio" direction)

Linear-Issue: JOS-198

## Why

The "Render Console" direction chosen in `define-visual-design` (JOS-180 follow-up, archived 2026-09-26) is a dark, all-monospace pipeline log: 12–13px text, raw state strings (`chunk-complete`, `image-generating`), one long column, and a left color bar as the only structure. It is drivable by agents but reads as a debug console, not a video tool, and every story since has added more text to the same column. The product owner reviewed a clickable mockup of a new direction ("Studio") and approved it on 2026-10-14: `https://claude.ai/artifact/3HdP5s6BDdPAJ6eAs8mebS` (version 2).

## What Changes

- Replace the token set in `frontend/src/styles/tokens.css` and the styling in `frontend/src/styles/app.css`: system font (monospace only for the session identifier), light and dark palettes selected by `prefers-color-scheme`, one accent color plus four semantic status colors, extruded surfaces (lit top edge, solid side, cast shadow), a rem-based 4/8 spacing scale.
- Restructure the session page layout: a sticky translucent top bar (wordmark, connection indicator, "New project"), a project panel (title, language, collapsible script, session status, pause/continue) beside the pipeline at ≥1024px and stacked above it below that, a four-step phase stepper, each phase as a card, scenes as a responsive grid of cards with a 16:9 thumbnail, and a final-video card.
- **BREAKING (visible text only):** scene, session and phase states are shown as plain-language labels with an icon ("Generating image", "Done", "Needs attention") instead of raw state strings. The wire contract and `status.ts` mapping are unchanged; three existing unit-test assertions on raw state text are rewritten.
- Motion: buttons sink into their extrusion on press and spring back; scene details unfold with a small spring; panels and cards pop in after the page's content changes from one session state to another. Everything falls back to no movement under `prefers-reduced-motion`; the translucent top bar goes solid under `prefers-reduced-transparency`.
- Drop the Google Fonts link from `frontend/index.html`; the visible title loses "(prototype)".
- No accessible name, role or test-only attribute changes. No new dependency, component library or router.
- Update `docs/frontend-standards.md` § Visual Design and its project-structure listing.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `visual-design`: the documented token set changes (palette with light and dark themes, typography, depth); status text becomes a plain-language label paired with an icon instead of the raw state name; contrast must hold in both themes; new requirements for a responsive layout without horizontal scrolling and for motion that honours reduced-motion and reduced-transparency preferences.

## Impact

- **Frontend code**: `frontend/src/styles/tokens.css`, `frontend/src/styles/app.css`, `frontend/index.html`, `App.tsx`, and the components `SessionPage`, `SessionHeader`, `PhaseSection`, `PhaseRetryButton`, `SceneList`, `SceneRow`, `StartProjectForm`, `FinalVideoDownload`. New `frontend/src/statusLabels.ts` (plain-language labels, mirroring `phaseLabels.ts`) and `frontend/src/components/Icon.tsx` (a handful of inline SVG glyphs).
- **Tests**: `frontend/test/components.test.tsx` — new tests for labels, stepper and connection indicator; three raw-state assertions rewritten. The "Accessible naming convention" suite must pass unchanged.
- **Backend, API, data model**: none.
- **Docs**: `docs/frontend-standards.md`; `docs/adr/0004-frontend-stack.md` gets a one-line pointer to this change.
- **Open branches**: JOS-157, JOS-159, JOS-163 and JOS-164 branches touch `SceneRow.tsx`, `SessionPage.tsx` and `app.css`; whichever merges second resolves the conflicts.
