# Step 8 — Measure the Timing Values

**Change:** define-provider-configuration (JOS-165)
**Date:** 2026-09-27
**Branch:** `feature/jos-165-define-provider-configuration`

Per Decision 7: repeated real calls per stage (4 each, not a single sample), with at
least one stage also measured under concurrent load. Sample sizes are spike-level (4-7
per stage), not a production SLA-grade percentile study — flagged where that matters.

## 8.1 — Latency spread per stage (4 samples each, wall-clock via `curl -w
"%{time_total}"`)

| Stage | Provider | Samples (s) | Min | Max | Spread |
|---|---|---|---|---|---|
| Reasoning | OpenAI (`gpt-6-astra`) | 8.47, 7.50, 7.05, 6.41 | 6.41 | 8.47 | 2.06 |
| Image | Fal.ai (`flux/dev`) | 9.22, 9.31, 10.79, 9.23 | 9.22 | 10.79 | 1.57 |
| Voice | ElevenLabs (TTS w/ timestamps) | 2.41, 2.20, 2.47, 2.25 | 2.20 | 2.47 | 0.27 |
| Alignment | ElevenLabs (forced-alignment) | 0.48, 0.31, 0.30, 0.26 | 0.26 | 0.48 | 0.22 |
| Video | RunningHub (5s/768P) | 156.68, 141.10, 148.38, 159.50 | 141.10 | 159.50 | 18.40 |

**Video is dramatically slower than every other stage** — roughly 15-30x the next
slowest (image). This is the dominant factor in overall pipeline latency and should
drive UX expectations (progress messaging, perceived-wait design) more than any other
stage's timing.

## 8.2 — Concurrent-load measurement

Chosen stage: **video (RunningHub)** — the stage Decision 9 already flags as highest-risk
given no failover exists. Fired 3 concurrent calls (not the full derived cap of 50/200
from task 7.5 for other stages — RunningHub's own cap was left undetermined in step 7c;
3 concurrent is a practical, affordable probe, not a claim about its real ceiling).

| Run | Total (s) | Time to `RUNNING` (s) |
|---|---|---|
| concurrent-1 | 156.12 | 0.47 |
| concurrent-2 | 157.56 | 0.47 |
| concurrent-3 | 156.68 | 0.46 |

**No degradation observed**: concurrent totals (156.1-157.6s) fall squarely within the
sequential baseline's range (141.1-159.5s), and time-to-`RUNNING` was identical to the
sequential samples (~0.46-0.47s each). At 3x concurrency, this account shows no
throttling or queueing. This does not establish the account's real concurrency ceiling —
only that it comfortably exceeds 3.

## 8.3 — Per-phase maximum time (set above the slow tail)

Derived with a ~50% margin above the observed max, given the very small sample size
(spike-level, not a percentile study):

| Stage | Observed max | Recorded provisional per-phase max | Margin basis |
|---|---|---|---|
| Reasoning | 8.47s | **20s** | >2x max; reasoning models can have higher tail variance than 4 samples show |
| Image | 10.79s | **25s** | >2x max |
| Voice | 2.47s | **10s** | generous absolute margin at small scale (network hiccups matter proportionally more) |
| Alignment | 0.48s | **5s** | generous absolute margin at small scale |
| Video | 159.50s | **240s (4 min)** | ~1.5x max, informed by both sequential and concurrent samples landing in the same band |

**These are provisional, not final** — 4-7 samples per stage is enough to see rough
spread (Decision 7's stated purpose) but not enough for a rigorous percentile-based SLA.
Revisit with a larger sample if the actual implementation's failure rate on timeout
suggests these margins are too tight or too loose.

## 8.4 — Clock starts at request-send, not queue-entry

Confirmed structurally consistent with this principle: in both the sequential and
concurrent RunningHub samples, time-to-`RUNNING` was ~0.46-0.48s in every single sample
(7 total) — never in a `QUEUED` state for any meaningful duration. **This session's tests
did not generate a real queueing scenario** (3x concurrency wasn't enough to trigger it),
so while the principle held in every observed case, there is no positive evidence yet
distinguishing queue-wait from execution time the way §10.1 anticipates a busier account
might see. Recorded honestly as untested-under-real-queueing rather than claimed as
fully verified.

## 8.5 — Assembly phase maximum time

**Not available.** `define-media-assembly` (JOS-182) is not yet archived (0/60 tasks per
earlier reports), so its measured cost cannot be taken. Recorded as provisional with the
dependency stated, consistent with how task 1.3 (speed-factor limit) handled the same
kind of gap.

## 8.6 — Spend to date

| Group | RunningHub spend | Other providers |
|---|---|---|
| Step 3 (video capability) | $2.140 | — |
| Step 7 (failure signals) | $0.385 (deliberate) + $0.385 (accidental) | negligible |
| Step 8 (timing, this report) | 4 sequential × $0.385 = $1.540, 3 concurrent × $0.385 = $1.155 → $2.695 | negligible |
| **Running total** | **$5.605** | of the **$20** ceiling |

Group 8's RunningHub spend ($2.695) landed under the $5 sub-budget the product owner set
for this group.
