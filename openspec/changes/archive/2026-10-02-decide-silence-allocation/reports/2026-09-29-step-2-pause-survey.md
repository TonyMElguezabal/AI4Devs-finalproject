# Step 2 Report — Pause Survey

- Date: 2026-09-29
- Change: decide-silence-allocation (JOS-142)
- Agent: Claude Sonnet 5
- Branch: `feature/jos-142-decide-silence-allocation`

## Method

Four scripts (`scripts/survey-scripts.ts`, 647-721 characters, two English and two Spanish), each narrated once for real (ElevenLabs `eleven_multilingual_v2`, native timestamps) and forced-aligned once on the same MP3 (`scripts/survey.ts`). For every survey × shape, the real `findSentences` → `buildUnits` → `sentenceSpeechSpans` pipeline (unmodified) produced the unit list, and every inner unit boundary's pause was measured as `spans[i+1].start - spans[i].end` — the gap `unitBoundaries` currently halves (rule B). No sentence in any script was long or short enough to trigger clause splitting or short-sentence grouping, so units are exactly the sentences in all 8 runs (7 sentences → 6 inner boundaries each, 48 pauses total, 24 per shape).

Each pause is tagged with the trailing punctuation of the unit before it (the actual cause) and the raw whitespace of the gap (to catch a paragraph break as extra whitespace beyond a single space).

## Results

By terminator and shape (seconds):

| Terminator | Shape | n | min | max | avg |
|---|---|---|---|---|---|
| `.` | native | 19 | 0.244 | 1.115 | 0.576 |
| `.` | alignment | 19 | 0.040 | 1.260 | 0.746 |
| `?` / `¿…?` | native | 2 | 0.511 | 0.696 | 0.603 |
| `?` / `¿…?` | alignment | 2 | 0.720 | 0.920 | 0.820 |
| `!` / `¡…!` | native | 2 | 0.697 | 0.697 | 0.697 |
| `!` / `¡…!` | alignment | 2 | 0.920 | 0.960 | 0.940 |
| `...` | native | 1 | 0.604 | 0.604 | 0.604 |
| `...` | alignment | 1 | 0.920 | 0.920 | 0.920 |

Overall: native 0.244-1.115 s (avg 0.590 s), alignment 0.040-1.260 s (avg 0.776 s). Alignment's pauses run both wider (bigger max) and narrower (smaller min) than native's — consistent with JOS-139's finding that alignment's own gaps (0.10 s lead-in, early cutoff) stack with the true pause, in either direction depending on where the surrounding characters actually landed.

**Longest pause: 1.260 s**, alignment shape, `english-exclamation-paragraph` boundary 1 (an ordinary sentence period, not the paragraph break). The forced-alignment shape, not the paragraph break, produced the single longest pause in this survey.

**Paragraph break** (`english-exclamation-paragraph`, boundary 0, gap `"\n\n"` after `!`): native 0.697 s, alignment 0.920 s — both within the ordinary range for a `.`/`!` terminator in this survey, not an outlier. A blank line in the script did not, by itself, produce an unusually long narrated pause from this voice.

**The em dash** (`english-question-dash`) produced no measurable inter-unit pause at all: it sits inside one sentence ("The answer was simple — he had promised…"), and neither `findSentences` nor `findClauseBoundaries` treats it as a cut point, so it never forms a unit boundary. This is expected and correct for D11's purposes — D11 only allocates silence at boundaries the system creates; a narrator's pause at a dash that stays inside one scene's fragment is not a silence any rule needs to assign.

## What this defines, for design Decision 3

- **"Representative pauses" (§14.1):** 0.04-1.26 s across sentence ends, a question, an exclamation, an ellipsis and a paragraph break, in two languages and two timestamp shapes. No terminator type stood out as systematically longer than the others in this sample.
- **The longest pause real narration produced here: 1.26 s.** The threshold sweep (group 4) starts at 1 s and should cover this value and beyond it.

## Files

`work/*.mp3`, `work/*.native.json`, `work/*.alignment.json`, `work/survey-results.json` (git-ignored, regenerable via `scripts/survey.ts`, which caches each provider call to disk).

## Spend

4 real text-to-speech calls (~2,755 characters total) and 4 real forced-alignment calls, all ElevenLabs subscription quota, no incremental charge.
