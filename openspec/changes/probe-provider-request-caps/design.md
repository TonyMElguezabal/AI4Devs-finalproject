## Context

`MAX_SIMULTANEOUS_REQUESTS` (from `maxSimultaneousRequests` in `backend/config/settings.default.json`) sets one FIFO semaphore per stage in `backend/src/concurrency.ts`. Current values and where they come from:

| Stage | Cap | Source |
|---|---|---|
| decomposition | 50 | OpenAI 500 req/min header ÷ 10 (measured) |
| image | 200 | Fal.ai 2000 header ÷ 10 (measured, window unknown) |
| voice | 3 | ElevenLabs Creator tier documents 5 concurrent requests; 3 + 2 = 5 (**not measured**) |
| alignment | 2 | same shared ElevenLabs account (**not measured**) |
| video | 3 | highest concurrency tried, no slowdown (JOS-165 step 8.2), **not a ceiling** |

JOS-165 step 7c deferred the RunningHub probe because of cost, and JOS-167 kept video at 3 for the same reason. The product owner has now approved both probes for JOS-188 (2026-10-29). RunningHub's account reports `apiType: SHARED` and documents no number. ElevenLabs returns `429` with a concurrency error when the account's limit is exceeded. Whether it also returns concurrency headers is unconfirmed.

The app is installed locally and every install uses its owner's own provider accounts. The probes measure the developer's accounts only.

## Goals / Non-Goals

**Goals:**
- Measure the ElevenLabs concurrent-request limit and confirm that voice and alignment draw from one pool.
- Find the highest RunningHub concurrency with no queueing, error or slowdown, up to 8, within $13.
- Record a derivation and a keep / raise / lower recommendation for voice, alignment and video, and apply it.

**Non-Goals:**
- Decomposition and image caps (already from measured headers; Fal.ai's window unit stays a separate open item).
- Per-install or per-tier caps detected at runtime. The existing `settings.json` override covers other tiers.
- Requests-per-minute limits (§10.1 asks only for simultaneous requests).
- Probing past 8 concurrent RunningHub jobs. At most 3 sessions and a cap of 3 are realistic today, so a ceiling above 8 changes nothing.

## Decisions

**Decision 1: drive the existing provider adapters from a throwaway script.**
The probe script under `openspec/changes/probe-provider-request-caps/probe/` calls `voiceProvider`, `alignmentProvider` and `videoProvider` with the key from the key store. The requests then match production in endpoint, model, output format and the 2K video setting. *Alternative*: raw curl. It is simpler, but its request can drift from what the app really sends, and the JOS-165 step 7c mistake (a billed call made by accident) came from hand-built requests. The script is evidence, not product code: it is not imported, not tested, and is excluded from lint if lint picks it up.

**Decision 2: ElevenLabs is probed at 5, 6 and 7 concurrent calls, then 3 voice + 3 alignment mixed.**
Each voice call sends about 20 characters, and each alignment call aligns that short clip. The limit is the largest level with no `429`. The mixed run confirms the pool is shared: if 6 mixed calls succeed while 6 voice-only calls get a `429`, the pool is not shared and the caps can be set per stage. Every response's status, error body and any `*concurrent*` header is logged. *Alternative*: ask ElevenLabs support. It is slow, and it confirms the documentation, not the account.

**Decision 3: RunningHub is probed with 5-second clips at 4, then 6, then 8, and stops at the first bad sign.**
Five seconds is the shortest admitted duration and so the cheapest. A level is clean when every job reaches `RUNNING` within 2 s (baseline 0.46-0.47 s), none reports `QUEUED` or an error, and every total stays within 1.25× the slowest sequential 5-second sample taken in the same run. The first level that is not clean stops the probe. The jobs use the production 2K setting ($0.60 each), since a lighter setting would put less load on the pool than the app does. Each level runs once; a level that is borderline (one job slower than the limit, or `RUNNING` between 1 and 2 s) is repeated once, and only that one. Before each level the script checks the remaining spend against the $13 ceiling (2 baselines + 4 + 6 + 8 = 20 jobs ≈ $12). *Alternative*: binary search up to 16. It costs more, and Non-Goals explains why a higher ceiling would not change the cap.

**Decision 4: a cap is the measured limit itself. No retry headroom is subtracted.**
ADR 0005 Decision 6's "headroom for the 1+3 retry budget" was written for rate limits (requests per minute), where retries add requests. A semaphore holds a slot for one request at a time, and a retry is sent only after the earlier attempt settles. *This is assumed, not yet verified*: task 1.3 checks that a retry never runs alongside its own earlier attempt (including one that timed out, which `provider-request-limit` says still holds its slot). If that check fails, one slot of headroom per stage is subtracted.
- ElevenLabs: voice + alignment = measured limit. Alignment calls take 0.26-0.48 s and voice calls up to 151 s, so alignment keeps 2 and voice takes the rest.
- RunningHub: video = highest clean level. It is raised only to a level that was actually tested.

## Risks / Trade-offs

- [The developer's tiers are not every user's tiers] → The reports name the tier tested. The `maxSimultaneousRequests` override in `settings.json` stays the answer for other accounts, and `docs/development_guide.md` already documents it.
- [RunningHub's `SHARED` pool depends on other customers' load at probe time, so a clean result can be luck] → A single clean run is accepted only if it is clearly clean; a borderline level is run a second time, and a level that is clean once and dirty once is not clean. The report states that the result is one afternoon's measurement.
- [Spend overrun from a failed or stuck job that RunningHub still bills] → Spend ceiling checked before each level; the script never retries a job; the report records actual spend from the account balance before and after.
- [A probe call fails for an unrelated reason, such as a bad key or moderation] → A fixed, neutral 20-character text and one stock image. Any non-concurrency error stops the run and is reported as inconclusive, not as a limit.

## Migration Plan

Only a change to the shipped defaults, so existing installs pick it up on update unless their `settings.json` overrides the value. To roll back, revert the value in `settings.default.json`.

## Open Questions

- Does ElevenLabs return concurrency headers? If not, the limit comes only from where the `429` starts.
- If the video ceiling is above 3, raising the cap makes long sessions finish sooner but spends money faster when several sessions run. The recommendation goes into the report, and the product owner decides before the default changes (task 4.2).
