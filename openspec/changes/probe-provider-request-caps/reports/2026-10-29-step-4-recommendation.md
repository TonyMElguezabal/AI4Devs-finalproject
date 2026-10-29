# Step 4 Report - Findings, recommendation and decision

- Date: 2026-10-29
- Change: probe-provider-request-caps (JOS-188)
- Time spent: about 1 h 45 min of agent work, from 18:44 UTC (task 0.2) to the end of level 6; the longest single wait was level 6 (about 8 minutes)
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

## Decision needed (task 4.2)

Owner: voice 5? video 4 or 6? alignment 2? Code and spec are changed only after this answer (CLAUDE.md §7).
