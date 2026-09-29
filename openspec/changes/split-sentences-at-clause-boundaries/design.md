# Design — Split a sentence at clause boundaries (JOS-141)

## Context

JOS-140 (`segment-script-into-chunks`, implemented on `feature/jos-140-segment-script`) finds sentences by a fixed rule, measures durations by one interim partition rule (boundaries at the midpoint of the pause between two units, 0 and the MP3's duration at the ends), and chooses a grouping by an exhaustive dynamic programme over sentences that prefers, in order: the fewest fragments ending on a sentence under the lower bound (other than the script's last), then the smallest total speed change, then fewer fragments, then the later first cut. The first rule (forbidding a short-ended fragment outright) failed on real narration, mostly 3-5 s sentences, so it was changed to "prefer, but allow" during JOS-140's apply. Its interim rule keeps whole, flagged `unsplittable-sentence`, (i) a sentence over 15 s and (ii) a short sentence plus the next sentence when together over 15 s. JOS-144 accepts a fragment over 15 s only with that flag, and checks that the fragments reproduce the script.

PRD §6.1: the clause-boundary split is "the only division permitted inside a sentence"; boundaries are "marked by comma, semicolon or conjunction". §6.1.1 extends it to the short-sentence case and keeps a boundary-less sentence whole. The ticket assumes a clause piece shorter than the lower bound follows the short-sentence rule.

## Goals / Non-Goals

**Goals:**
- Replace JOS-140's interim rule with real splitting wherever a boundary exists, without changing anything for sentences that do not need it (AC3).
- Keep one search for the whole script, so AC1's choice of split points is optimal under JOS-140's cost, not greedy.

**Non-Goals:**
- Speed-factor warnings and requested durations (JOS-148, JOS-147); intervals (JOS-143).

## Decisions

**Decision 1 — Clause boundaries are found by a fixed rule and a per-language list.**
A boundary lies right after `,` or `;` when followed by whitespace, and right before a listed conjunction preceded by whitespace (case-insensitive, a whole word, never the sentence's first word). A comma or semicolon directly followed by a conjunction is one boundary, after the punctuation. Commas inside numbers ("1,000") are not boundaries, since no whitespace follows. Conjunctions:
- English: and, but, or, nor, so, yet, because, although, though, while, whereas, unless, until, since
- Spanish: y, e, o, u, ni, pero, sino, aunque, porque, mientras, pues
The list is small on purpose and lives in one constant per language.
*Alternative rejected:* coordinating conjunctions only — too few boundaries in long narrative sentences, which often continue with "because" or "while"; a language model — not deterministic and costs a call.

**Decision 2 — A sentence is split into clause units only when the rules require it (AC3).**
Before the search, each sentence is classified:
- **Must-split, free:** its duration alone exceeds 15 s (AC1). Every clause boundary inside it may be a cut; the search chooses which.
- **Must-split, first clause borrowed:** it follows a short sentence (under 5 s) and the two together exceed 15 s (AC2). The short sentence's chunk must end at one of its clause boundaries; the rest continues as units that may be cut at later boundaries only if the sentence is also a free must-split, otherwise the rest stays whole.
- **Whole:** everything else; no internal cut is ever allowed.
Must-split sentences with no boundary stay whole and keep JOS-140's `unsplittable-sentence` flag (AC4). A sentence can be both kinds; the free rule then applies to its remainder.

**Decision 3 — Clause pieces are units in JOS-140's search, and short pieces follow the short-sentence rule.**
The search runs over units (whole sentences, and clause pieces of must-split sentences) with the same allowed-chunk rules, cost and preference order as JOS-140 (fewest short-ended fragments, then least total speed change, then fewer fragments, then later first cut), where "short" now applies to pieces too (the ticket's assumption): a fragment ending on a short piece is allowed but counted, exactly like a fragment ending on a short sentence. Durations use JOS-140's `chunkDurations` over units, so a boundary between two clause pieces lies at the midpoint of the pause between them. A single clause piece still over 15 s with no inner boundary is a chunk flagged `unsplittable-sentence`.
*Alternative rejected:* splitting each long sentence once, greedily, before the search — it cannot choose among several split points by the global cost, and it can produce pieces that break the lower bound when a better cut existed.

**Decision 4 — Pieces are exact substrings, cut at whitespace.**
Every cut falls on the whitespace after a comma or semicolon, or before a conjunction. Pieces are the text on either side, trimmed; joining them with a single space reproduces the sentence apart from whitespace (AC5), which JOS-144 checks again.

**Decision 5 — `unsplittable-sentence` now means "no clause boundary".**
After this change, the flag appears only on a sentence (or piece) that must split and cannot. JOS-140's interim meaning ("not split yet") disappears; its spec requirement is narrowed by this change's `clause-splitting` requirements.

## Risks / Trade-offs

- **A conjunction inside a fixed phrase ("rock and roll", "blanco y negro") is still a boundary.** → Cuts happen only in must-split sentences and the search prefers cuts that fit the bounds best; an awkward cut is a readability cost, never an invalid fragment.
- **The conjunction lists are a choice, not a PRD value.** → One constant per language, easy to change after review.
- **The search grows with clause units.** → Only must-split sentences add units; the search stays O(n²) in units.

## Migration Plan

No schema change. Rollback: revert the code; JOS-140's interim rule returns.

## Open Questions

None blocking.
