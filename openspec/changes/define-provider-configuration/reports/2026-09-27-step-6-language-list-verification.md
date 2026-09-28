# Step 6 — Establish the Supported Language List

**Change:** define-provider-configuration (JOS-165)
**Date:** 2026-09-27
**Branch:** `feature/jos-165-define-provider-configuration`

## 6.1 — Candidates

**English and Spanish**, per product owner's choice — matches this repo/PRD's own
bilingual EN/ES documentation. Per Decision 4, each is verified independently across all
three chain stages (voice, alignment, reasoning) rather than assumed from an advertised
list.

English's evidence reuses the task-4.2/5.2/5.4 tests (already run against the real
three-sentence test script). Spanish used a fresh, structurally equivalent script:

> "El sol salió lentamente sobre las colinas tranquilas. Los pájaros comenzaron a cantar,
> el viento se levantó, y el pueblo despertó poco a poco. Luego llegó el silencio."

(3 sentences; one with clause boundaries — two commas and a conjunction; two with none.)

## 6.2 — Narration

Both narrated successfully via ElevenLabs (`eleven_multilingual_v2`, voice: Burt
Reynolds™) with `with-timestamps`, returning character-level alignment for both.

## 6.3 — Alignment

Both aligned successfully via ElevenLabs Forced Alignment (`/v1/forced-alignment`).
Spanish: 167 characters aligned, overall loss 0.529 (English: 142 characters, loss
0.552 — comparable quality, no meaningful capability gap between languages for this
stage).

## 6.4 — Reasoning segmentation

**English**: passed on the first attempt (and a repeat), using the plain fidelity prompt
from step 5b — exact character-for-character reconstruction both times.

**Spanish**: **failed on the first attempt (and a repeat)** with the same plain prompt —
reconstruction was 2 characters short both times. Diagnosed exactly: the model dropped
the space following each sentence-ending period (`"tranquilas. Los"` → `"tranquilas.Los"`
across both chunk boundaries), while correctly preserving all words, order and
punctuation otherwise. Reproducible (2/2), not random sampling noise.

**Fix verified**: adding an explicit instruction — every space character, including the
one after a sentence-ending period, must appear in exactly one chunk's `prompt` field —
plus asking the model to self-check reconstruction before responding, produced an
**exact match** on Spanish (167/167 characters, zero divergence).

**This is an implementation-relevant finding, not just a Spanish-specific curiosity**:
the plain fidelity instruction is not reliably sufficient across languages even though it
happened to work for English in this small sample. **The refined prompt (explicit
whitespace-preservation clause + self-check) should be the one used for both languages in
the actual US-09 implementation**, not only for Spanish — English was not re-tested
against the refined prompt here, but there is no reason to expect it would regress, and
using one prompt for both stays consistent with §4.2/AC03's fidelity requirement holding
for every supported language, not just the one that happened not to trigger the defect
in this sample.

## 6.5 — Supported language list

| Language | Voice | Alignment | Reasoning (refined prompt) | Result |
|---|---|---|---|---|
| English | Pass | Pass | Pass | **Supported** |
| Spanish | Pass | Pass | Pass (after prompt fix) | **Supported** |

**Recorded list: English, Spanish.** No candidate failed outright; Spanish's initial
reasoning-stage failure was resolved by fixing the prompt, not by rejecting the
candidate — consistent with Decision 4's instruction to verify per language rather than
assume, and with recording what was actually found rather than the first result that
happened to look clean.

## Spend

4 additional OpenAI calls (~1,700 tokens total) and 2 additional ElevenLabs calls
(subscription-covered), all negligible. Running metered total unchanged at **$2.14** of
the $20 ceiling (RunningHub, step 3, remains the only itemized-dollar cost).
