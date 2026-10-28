## Context

`frontend/src/components/StartProjectForm.tsx` holds `title`, `script` and `language` in `useState` and renders the Script `<textarea id="project-script">` inside a `.field`. There is no hint text under any field yet. Small pure helpers live in single-purpose modules under `frontend/src/` (`phaseLabels.ts`, `statusLabels.ts`). The form's tests are in the `describe("StartProjectForm")` block of `frontend/test/components.test.tsx`. Nothing in the backend counts words or estimates duration, and PRD §4.1 sets no word limit.

## Goals / Non-Goals

**Goals:**
- Show the word count and a rough video duration under the Script field, current while typing and when the field loses focus.
- Keep it frontend-only and out of the submission path.

**Non-Goals:**
- A per-language or per-voice rate. A rate measured from real voice-overs.
- Any limit, warning or block based on length.
- Counting spoken forms. For example, `401k` counts as one word, not "four oh one k".

## Decisions

### 1. A pure `scriptEstimate.ts`, derived on render

`estimateScript(script: string): ScriptEstimate | null` returns `{ words, seconds }`, or `null` for a blank script. `formatEstimate(estimate)` returns the display line. The form calls it while rendering from the existing `script` state. It needs no new state, no `onBlur` handler and no debounce. Live updating covers "on leaving the field" for free, and counting 1500+ words takes far less than 1 ms. A `useMemo` or a debounce is not worth its code until typing measurably lags.

Alternative rejected: computing on `blur` into state. That is more code, and the line goes stale while the User types.

### 2. Counting and rate

- Words: `script.trim().split(/\s+/)`, which gives 0 when the trimmed script is empty. This matches the ticket's 38-word example, where `penalty-free` and `401k` each count as one word.
- `NARRATION_WORDS_PER_MINUTE = 150` is one exported constant. Typical narration runs 140 to 160 wpm, and the video's length follows the voice-over because clips are fitted to it (PRD §7.3).
- Seconds: `Math.round(words * 60 / 150)`. Format `~m:ss`, with seconds zero-padded and minutes unbounded (`~0:15`, `~10:00`, `~12:30`).
- `1 word` versus `N words`, then ` · Estimated video duration ~m:ss`.

### 3. Markup and accessibility

The form renders `<p id="project-script-estimate" className="field-hint">` after the textarea only when the estimate is not `null`. While the line is shown, the textarea carries `aria-describedby="project-script-estimate"`; otherwise the attribute is left off, so it never points to a missing element. The line has no `aria-live`: it would be announced on every keystroke. The accessible name stays `Script`, so the naming-convention suite is unchanged.

### 4. Style

Add `.field-hint { font-size: var(--font-size-sm); color: var(--color-muted); }` to `styles/app.css`, using the existing tokens, so light and dark both follow the theme.

## Risks / Trade-offs

- Scripts with many numbers or abbreviations are narrated longer than their word count suggests, and languages differ in pace. → The line says "Estimated" and `~`, and the rate is one constant to retune once real voice-over durations are compared.
- 150 wpm is a single rate for both English and Spanish. → Accepted by the product owner on 2026-10-28. Add a per-language map only if real narrations drift.

## Migration Plan

None. This is a frontend-only addition, with no data or API change. Rollback means reverting the commit.

## Open Questions

None. The rate, the format and the trigger were decided by the product owner on 2026-10-28 (JOS-236).
