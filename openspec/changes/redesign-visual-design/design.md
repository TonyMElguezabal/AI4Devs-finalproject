# Design — Redesign the frontend visual design ("Studio" direction)

## Context

`define-visual-design` (archived 2026-09-26) chose "Render Console": a fixed dark theme, IBM Plex Mono everywhere, 12–13px type, and one vertical column where each block carries a left status bar. Since then, eight stories added content to that column (phase sections, stage diagnostics, PROMPT/IMAGE/VIDEO, the paused "still generating" and "waiting for continue" lines, clip correction, read-driven downloads), all styled as more lines of monospace text.

The product owner approved the "Studio" mockup (`https://claude.ai/artifact/3HdP5s6BDdPAJ6eAs8mebS`, version 2) on 2026-10-14, including two additions made during review: extruded, three-dimensional-looking surfaces, and a small "opening" spring on interactions.

Current state on `feature/entrega-2-JAME` (base `256b08f`):

- `src/styles/tokens.css` (33 lines) and `src/styles/app.css` (358 lines) hold all styling. Components only add class names.
- `src/styles/status.ts` maps every scene state (with `held`), session state and phase status to one of four status classes. `src/phaseLabels.ts` already maps phase statuses to text ("Not started", …). Scene and session states are rendered as their raw wire strings.
- `SessionPage` renders, in order: a `session-meta` line (id + "connected"/"connecting…"), `SessionHeader` (section "Session status"), the title and script as paragraphs, then one `PhaseSection` per phase, with `SceneList` inside the scenes phase and `FinalVideoDownload` inside the assembly phase.
- `components.test.tsx` asserts raw state text in three places (lines 83–88 and 957–959).
- The app ships as a local packaged app on macOS and Windows (Chromium-based), so `color-mix()`, `backdrop-filter`, `:has()` and the `prefers-*` media features are all available.

Constraints: the accessible-name convention in `docs/frontend-standards.md` is fixed; no component library, no router; no new runtime dependency; types fully strict.

## Goals / Non-Goals

**Goals:**

- Apply the approved Studio look across every existing screen and state.
- Replace raw state strings with plain-language labels from one mapping.
- Keep every accessible name and role in the convention table, and keep `status.ts`, `phaseActions`, `sceneActions` as the single sources they are today.
- Light and dark themes that follow the operating system.
- Depth and motion done in CSS, honouring reduced-motion and reduced-transparency.

**Non-Goals:**

- No new screens (the project-list gap in `frontend-standards.md` § Not Yet Decided stays open).
- No manual theme toggle; the OS preference decides.
- No gesture-driven interaction (drag, swipe); nothing here needs a spring physics library.
- No backend, API or data-model change. No new data is requested: the panel's "Started …" line uses `createdAt`, which the session read already carries (`docs/api-spec.yml`) and `types.ts` now declares. The mockup's voice-over duration line is illustrative and is not built, because the session read does not carry it.

## Decisions

### 1. Depth and motion are pure CSS, not an animation library

Extrusion is a layered `box-shadow` per surface: an inset 1px highlight on the top edge, a solid offset shadow in an `--edge` color (the "side"), and a soft cast shadow. Three tokens cover all sizes: `--extrude-sm` (buttons, steps), `--extrude` (cards), `--extrude-lift` (hovered or open scene card). Pressing a button translates it down by the side's height and collapses the side to 0, so it reads as a key being pressed. The "spring" is a single overshooting easing token, `--spring: cubic-bezier(.34, 1.45, .64, 1)`.

Opening animations are CSS keyframes that run when an element mounts: scene details (`open-card` on the card, `unfold` on the details), panels and cards (`pop-in`, staggered through a `--i` custom property set inline). React keeps existing DOM nodes across live updates, so content already on screen does not replay its entrance; only newly mounted nodes (newly decomposed scenes, freshly opened details) animate. This satisfies the "live update" scenario without any flag.

*Alternative considered:* Motion (Framer Motion) springs. Rejected: it adds a dependency, and its advantage — interruptible, velocity-aware springs — only matters for gesture-driven elements, which this UI does not have. If a drag interaction is ever added, revisit.

### 2. Theme follows `prefers-color-scheme`; no toggle

`tokens.css` defines the full light palette on `:root` and redefines only the tokens inside `@media (prefers-color-scheme: dark)`, also setting `color-scheme: dark` so native controls and scrollbars follow. Components never reference a color inside a media query.

This reverses Render Console's "dark only, fixed" decision. The product owner accepted it by approving a mockup that follows the system theme. *Alternative:* keep dark only — rejected because the packaged app runs on desktops where the OS theme is the user's stated preference.

### 3. Plain-language labels come from one new mapping: `src/statusLabels.ts`

Mirrors `phaseLabels.ts`:

| Scene state | Label | | Session state | Label |
|---|---|---|---|---|
| `submitted` | Queued | | `submitted` | Registered |
| `image-generating` | Generating image | | `voice-over-generating` | Recording voice-over |
| `image-complete` | Image ready | | `voice-over-complete` | Voice-over ready |
| `video-generating` | Generating clip | | `chunk-decomposing` | Splitting into scenes |
| `chunk-complete` | Done | | `chunks-processing` | Generating scenes |
| `failed` | Failed | | `final-video-generating` | Assembling final video |
| | | | `final-video` | Final video ready |
| | | | `failed` | Needs attention |

The existing modifiers stay as text beside the label: a held scene shows "Waiting for continue", a scene still generating during a pause shows "Still generating", and the session header keeps "Paused — waiting for you to continue", "Still generating: …" and "Waiting for continue: …". `Affected stage` shows "Image" or "Clip" through the existing `STAGE_DIAGNOSTIC_LABEL`. Duration and speed warnings become sentences taken from the wire contract's own definitions ("The narrated interval is longer than the longest clip duration the provider offers." and "The speed adjustment this clip needs is above the acceptable limit.") instead of `exceeds-maximum`/`exceeds-limit`; no numeric limit is stated, because the limit lives in the backend and the page must not repeat it.

*Alternative:* keep raw state strings and only restyle. Rejected by the product owner during mockup review.

### 4. Layout: project panel + pipeline, CSS grid with one breakpoint

`SessionPage` wraps its content in a grid: an `<aside>` project panel and a pipeline column. At ≥1024px the grid is `320px minmax(0, 1fr)` and the panel is `position: sticky`; below, one column. The panel contains, in order: the title (now an `h1`), the language and a "Started …" time (from `createdAt`), the script inside a native `<details>`/`<summary>` ("Show script" / "Hide script"), the unchanged `SessionHeader` section with its pause/continue button stretched to full width, a named "Scenes done" progress bar (a count of `chunk-complete` scenes; present only when scenes exist), and the session id.

The pipeline column contains a new `PhaseStepper` (a `<div role="group" aria-label="Pipeline progress">` with one step per phase: icon, phase name, status label) and then the existing `PhaseSection`s rendered as cards. The stepper is read from `session.phases` only; it derives nothing. It is deliberately a group, not an `<ol>`: existing tests (and agent-driven E2E) read the page's `listitem` roles as "the scenes", so scene rows must stay the only list items besides the stage diagnostics.

`App.tsx` renders a new `TopBar` component (a sticky `<header>`) holding the wordmark "Vid4You", the connection indicator ("Live" / "Connecting…", moved out of `SessionPage`, which loses its `connected` prop) and, on a session page only, a "New project" button that calls the existing `handleStartNew`. The top bar is translucent (`backdrop-filter`) with a 1px shadow line instead of a border.

*Alternative:* tabs per phase. Rejected: it hides progress in other phases, and the stepper already gives the overview.

### 5. Scenes are a grid of cards; details expand the card across the row

`SceneList` keeps its `<ul>` and ascending sort; the `<ul>` becomes `grid-template-columns: repeat(auto-fill, minmax(190px, 1fr))`. Each `SceneRow` `<li>` keeps `aria-label="Scene {n}"` and becomes a card: a 16:9 thumbnail, a status pill, the requested duration, the held/still-generating text, the error cause, and the unchanged "View/Hide scene N details" button.

- The thumbnail uses `scene.result.imageUrl` when present, with `alt=""` because the details already contain the named `Scene {n} image`; a shimmer placeholder while `image-generating`; an empty dashed glyph otherwise. The index badge on the thumbnail is `aria-hidden` (the `<li>` name already carries it).
- When expanded, the card gets `grid-column: 1 / -1` and shows the details in two columns (media and downloads | metadata, diagnostics, warnings, retry, correction form). Every named element inside (diagnostic groups, image, clip, retry button, correction form and textarea, download links, refusal status) keeps its current name and role.

### 6. Icons are a tiny local component, not a library

`src/components/Icon.tsx` exports one `Icon` component taking a `name` from a closed union (`check`, `progress`, `failed`, `queued`, `pause`, `play`, `download`, `retry`, `chevron`, `plus`). Each is an inline SVG using `currentColor`, always `aria-hidden="true"` and `focusable="false"`. `status.ts` gains `statusIcon(StatusClass)` so a status's icon is chosen from the same mapping as its color.

*Alternative:* Phosphor or Heroicons. Rejected: a dependency for ten glyphs.

### 7. Typography and spacing tokens

`--font-ui: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` everywhere; `--font-mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace` only for the session id. Sizes in rem: 0.75 / 0.8125 / 0.9375 (body) / 1.25 / 1.75. Headings use negative tracking (−0.01 to −0.025em), uppercase eyebrows +0.04em. Spacing tokens `--space-1`…`--space-6` = 0.25/0.5/0.75/1/1.5/2rem. Durations and figures that line up use `font-variant-numeric: tabular-nums`. The Google Fonts `<link>` is removed from `index.html`.

### 8. Contrast is verified by computation, both themes

A small Node script kept in this change's `reports/` folder (not in `src/`) parses `tokens.css`, resolves each documented text/background pair (including status text on its 13%-tinted pill background, computed the same way as `color-mix`) for both themes, and prints WCAG ratios. Its output goes into the verification report. Any pair under 4.5:1 is fixed in the tokens before implementation continues.

## Risks / Trade-offs

- [Open frontend branches (JOS-157, JOS-159, JOS-163, JOS-164) edit `SceneRow.tsx`, `SessionPage.tsx` and `app.css`] → The gate task lists which have merged; this change rebases onto them first. Whichever merges second resolves the conflict; this design keeps markup changes additive (wrappers and classes) to keep conflicts mechanical.
- [jsdom cannot see CSS, so unit tests cannot prove the look, the breakpoint, contrast or motion] → Unit tests cover labels, stepper content, connection text and accessible names; the browser E2E step checks 375/1024/1440px, both themes, reduced motion, and takes screenshots for the report; contrast is computed (Decision 8).
- [Overshooting easing can feel bouncy on large surfaces] → The spring is used for entrances and press release only; large layout changes (the card spanning the row) are instant, with only the unfold animated.
- [Two named images if the thumbnail were labelled] → Thumbnail is decorative (`alt=""`); details keep the single named image.
- [Raw state strings disappear from the UI, which agents and logs may have relied on] → The E2E convention locates elements by name and role, never by state text; the three unit assertions on raw text are rewritten to the labels.

## Migration Plan

Frontend-only and stateless: merge replaces the styling. Rollback is reverting the branch's commits; no data or API migration.

## Open Questions

None. Theme behaviour, labels, depth and motion were settled in mockup review.
