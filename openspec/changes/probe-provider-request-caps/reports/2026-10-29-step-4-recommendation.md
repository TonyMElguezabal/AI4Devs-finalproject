# Step 4 Report - Findings, recommendation and decision

- Date: 2026-10-29
- Change: probe-provider-request-caps (JOS-188)
- Time spent: 5 h 49 min of wall-clock from 18:44 UTC (task 0.2) to 00:33 UTC (task 10.3), most of it waiting on the owner's decisions; about 45 min were probe runs (ElevenLabs about 5 min, RunningHub baselines 9 min, level 4 about 6 min, level 6 about 8 min, plus settle reads)
- Reports: step 2 (ElevenLabs), step 3 (RunningHub)

## Findings

| Stage | Cap today | Measured | Recommendation |
|---|---|---|---|
| voice | 3 | 5 concurrent calls succeed, the 6th gets `429`; header `maximum-concurrent-requests: 5` | **Raise to 5** |
| alignment | 2 | independent of voice; 10 concurrent calls succeed | **Keep 2** (no benefit measured; calls last 0.3 s) |
| video | 3 | 4 and 6 concurrent jobs clean; no `QUEUED`, no errors, no slowdown | **Raise to 4 or 6** (owner's choice, see below) |

## Trade-offs

- **Voice 5:** uses the whole ElevenLabs allowance for the app. Anything else on the same key (a second app instance) then causes `429`s, which the retry policy treats as transient, so the cost is a delayed retry. Keeping 4 would leave one slot free at the price of one slot of speed. Recommended: 5, as the design's rule (cap = measured limit) says.
- **Video 6 vs 4:** tested clean at both. 6 is the highest level actually tested, which is what the spec allows; 4 is a smaller step on a shared pool measured in one afternoon. More simultaneous jobs does not raise the cost per clip, it finishes sessions sooner. Recommended: **6** if the owner accepts a one-afternoon measurement, otherwise 4.
- **Spec premise:** "voice and alignment together SHALL NOT exceed the limit" is false (separate pools). The spec is reworded to: voice at most the measured ElevenLabs limit; alignment independent.

## Open items

- Alignment latency under load (1.9-2.7 s against 0.3 s alone, one 5 s timeout) puts `maxTimeSeconds.alignment` = 5 s at risk; not changed here, worth a ticket.
- RunningHub billing: the balance falls 3.4 times the itemized price (step 3). Needs the dashboard charge list.
- Caps are for the developer's accounts (ElevenLabs Creator, RunningHub `SHARED`).

## Decision (task 4.2)

Owner, 2026-10-29: **voice 4, alignment 2, video 4.** Voice is one below the measured limit (a slot for another consumer of the key) and video is below the highest level tested (6). The spec was changed first, then the tests, then the config (CLAUDE.md §7).

Next step: **proceed.** The caps are applied. Still open for the owner: the RunningHub charge list (cost 3.4 times the itemized price) and a ticket for `maxTimeSeconds.alignment`.
