# Step 3 Report - RunningHub concurrency probe

- Date: 2026-10-29
- Change: probe-provider-request-caps (JOS-188)
- Agent: Claude
- Account: RunningHub `apiType: SHARED`; endpoint `/openapi/v2/minimax/hailuo-h3/image-to-video`, 5 s clip, **2K** (the app's setting), one 1344×768 gradient image
- Script: `probe/probe.ts` (`video` command). Raw results: `probe/results/runninghub-baselines.jsonl` (all four runs; the file name predates levels 4 and 6)

## Method

Each level submits N jobs at once through the real adapter and polls each every 1 s until `SUCCESS`. A level is clean when every job reaches `RUNNING` within 2 s, none shows `QUEUED` or an error, and every total stays within 1.25 × the slowest sequential baseline (318.8 s → 398 s). The account showed 0 running tasks before every run. The probe stops at the first level that is not clean.

## Results

| Level | Jobs | Succeeded | `QUEUED` seen | Errors | Time to `RUNNING` (s) | Generation time (s) |
|---|---|---|---|---|---|---|
| 1 (baseline) | 1 | 1 | no | 0 | 0.23 | 318.3 |
| 1 (baseline) | 1 | 1 | no | 0 | 0.22 | 219.8 |
| 4 | 4 | 4 | no | 0 | 0.96-1.79 | 249.9-289.2 |
| 6 | 6 | 6 | no | 0 | 1.31-1.45 | 227.4-295.5 |

- Statuses seen in every job: `RUNNING`, then `SUCCESS`. Every finished task itemizes `thirdPartyConsumeMoney: 0.6`.
- Every generation time at levels 4 and 6 falls inside the baseline range (219.8-318.3 s). The two sequential baselines already differ by 45%, so total time shows noise, not load.
- Time to `RUNNING` is 1-1.8 s at levels 4 and 6 against 0.2 s alone. The status never read `QUEUED`, and the figure does not rise from 4 to 6, so it reads as the cost of submitting several jobs at once from one client (upload and submit run in parallel, each job's first poll waits behind them), not as queueing.

## Findings

1. **No concurrency limit reached up to 6.** Levels 4 and 6 are clean on every criterion. The ceiling is somewhere above 6 or may not exist for this account. Level 8 was not run (owner decision: no cap the app can use today needs it).
2. **Each level ran once.** Level 4 had two jobs with time to `RUNNING` between 1 and 2 s, which the design calls borderline and says to repeat. It was not repeated: level 6, run later, showed the same figure with no `QUEUED`, which settles the question without a $8 re-run. This is one afternoon on a shared pool.
3. **Cost does not match the itemized price.** See below.

## Cost accounting (unresolved)

| Reading | Balance (USD) | Change |
|---|---|---|
| First check, before any job | 68.819 | |
| Before baseline 1 | 65.579 | **-3.24 with no job of mine running** |
| After baseline 1 / 10 s later | 63.419 / 62.459 | -2.16, then -0.96 |
| Before baseline 2 → after | 62.459 → 60.419 | -2.04 |
| Before level 4 | 57.539 | **-2.88 with no job of mine running** |
| Level 4 (4 jobs) | 57.539 → 49.859 | -7.68 (1.92 per job) |
| Level 6 (6 jobs) | 49.859 → 44.099 | -5.76 (0.96 per job) |
| **Total** | 68.819 → 44.099 | **-24.72 for 12 jobs (2.06 per job)** |

The itemized price is $0.60 per job ($7.20 for 12). The balance fell 3.4 times as much, in lumps that do not line up with job starts and ends, including $6.12 that fell while I was not running RunningHub jobs. Two explanations fit and the data cannot separate them: charges that post late and in batches, or another consumer of the same key (other checkouts were running tests at the time). The probe's own contribution cannot be isolated; its spend is between $7.20 (itemized) and $24.72 (balance). **Action for the owner:** read the charge list in the RunningHub dashboard for 2026-10-29; the answer decides whether `pricePerUnit` for this provider should stay at $0.60.

## Outcome

- Steps 3.1-3.3: PASS (probe complete to level 6; level 8 intentionally skipped)
- Spend by balance: $21.48 from the first baseline to the end of level 6 (the $3.24 before it is excluded); the $30 ceiling was not reached.
