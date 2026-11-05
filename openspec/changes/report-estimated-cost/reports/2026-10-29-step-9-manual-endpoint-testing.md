# Step 9 Report - Manual Endpoint Testing with curl

- Date: 2026-10-29
- Change: report-estimated-cost (JOS-227)
- Agent: Claude Opus 5.5

## Setup
- The real backend of this worktree (`npm start`) on port 3127 with a scratch `DB_PATH` and `PROJECTS_ROOT`, `ADMIN_PASSWORD` set for the run, `ALLOW_TEST_ENDPOINTS=1`, and no vendor key in the environment. It created and migrated an empty store and seeded its five default (unpriced) profiles.
- Five profiles were created through `POST /admin/provider-profiles` (the JOS-226 price path), each with a marker API key (`MARK-KEY-*`): "Voice USD" at 0.0003 USD per character (entered as `usd`, stored as `USD`), "Align Free" at 0 USD, "Reasoning Unpriced", "Image Unpriced", and "Video EUR" at 0.05 EUR per clip second.
- Three sessions were added to the scratch store with `sqlite3` (the sessions were not run through the pipeline: no vendor key is configured and the report reads only the stored attempts):
  - "Cost A" (25 Oct, script of 43 characters): voice, alignment (42.5 s voice-over) and reasoning successes; two scenes, both images successful, scene 1's 5 s clip failed twice (transient) and then succeeded, scene 2's 7 s clip succeeded.
  - "Cost B" (27 Oct, 23 characters): one transient voice attempt, then a success; one scene with an image and a 6 s clip.
  - "Cost C" (10 Sep, 30 characters, outside the last 30 days): one voice success.
- Marker texts sit in the scripts (`MARKER-SCRIPT-*`), a failure message (`MARKER-FAILURE-B`), the instructions (`MARKER-IMAGE-INSTRUCTION`, `MARKER-VIDEO-INSTRUCTION`) and a scene error (`MARKER-SCENE-ERROR`).

## Results
| Check | Result |
|---|---|
| 9.2 Without a password, with a wrong one (AC5) | 401 `password-required`, 401 `wrong-password` |
| 9.3 All time (no `from`) | Voice USD 96 billed / 23 failed characters, 0.0288 USD; Align Free 42.5 s, 0 USD (priced); Reasoning and Image unpriced (`null` price and cost); Video EUR 18 billed / 10 failed clip seconds, 0.9 EUR. Totals `EUR 0.9`, `USD 0.0288`, `totalsExcludeUnpriced: true` (AC1, AC2, AC4) |
| 9.3 Last 30 days (`from=2026-09-29`) | Same, but voice 66 characters (Cost C drops), 0.0198 USD |
| 9.3 Custom range 26–28 Oct | Only Cost B: voice 23 billed / 23 failed, image 1 unpriced, video 6 s, 0.3 EUR |
| 9.3 Against the spike's R2 query | `poc/queries.sql` R2 run with `sqlite3` on a copy of the same store for the three periods gives the same stage, provider, unit, billed units, price and cost on every row (R2 rounds to 4 decimals, the API does not), and `unpriced` exactly where the API has `null` |
| 9.3 Sessions report | Cost A: EUR 0.60 (12 clip seconds; the two failed attempts add nothing) and USD 0.0129, `excludesUnpricedProvider: true` (image and reasoning unpriced); Cost B: EUR 0.30 and USD 0.0069, true; Cost C: USD 0.009, false (AC3) |
| 9.4 `from` after `to`; `from=yesterday` | 400 `querystring/from must be before to`; 400 `querystring/from Invalid datetime` |
| 9.5 Content | The three cost reports and the sessions report (4,554 bytes) hold none of the markers: 0 hits for `MARKER` or `MARK-KEY` |
| 9.5 Store unchanged | Row counts (runs/stage_attempts/scenes/provider_requests/voice_overs/provider_profiles) `3/6/3/8/1/10` before and after every read |
| OpenAPI | Covered by the route test "is in the generated OpenAPI document" |

## Finding
- Amounts are returned unrounded (for example `0.30000000000000004`), as design Decision 2 says; the page formats them to the currency's minor unit. See the step 10 report.

## Database state
- No store was created under `backend/data/`; the server did write the provider master key to `backend/data/provider-keys.key` when the profiles were created (see the step 10 report), which was removed in the cleanup.
- The scratch store and the running server are kept for the browser check (step 10) and removed at its end (task 9.6 is completed there).

## Outcome
- Step 9 status: PASS
- Blocking issues: none
