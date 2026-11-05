# Step 2 Report - ElevenLabs concurrency probe

- Date: 2026-10-29
- Change: probe-provider-request-caps (JOS-188)
- Agent: Claude
- Account: ElevenLabs **Creator** tier; 15,351 → 19,814 of 245,986 characters used (4,463 spent by this probe)
- Script: `probe/probe.ts` (`eleven` command). Raw results: `probe/results/elevenlabs-*.jsonl`

## Method

Each shape fires its calls at the same moment through the real voice and alignment adapters, with a fetch wrapper that records each response's status, concurrency headers and, on an error, the body. Voice text was 18 characters in the voice-only shapes. In the mixed shapes it was ~360 characters, so the voice calls were still running when the alignment calls started 300 ms later (the first mixed attempt used 18 characters, finished too fast to overlap, and is discarded). Pauses of 8 s between shapes let the provider's count drain.

## Results

| Shape (calls at once) | Runs | Outcome per run |
|---|---|---|
| voice × 5 | 2 | 5 × `200` |
| voice × 6 | 2 | 5 × `200`, **1 × `429`** |
| voice × 7 | 2 | 5 × `200`, **2 × `429`** |
| voice × 3 + alignment × 3 (staggered +300 ms, all overlapping) | 3 | 6 × `200` |
| voice × 5 + alignment × 1 (6 in flight) | 3 | 6 × `200` |
| alignment × 6 | 2 | 6 × `200` |
| alignment × 8 | 2 | 8 × `200` |
| alignment × 10 | 2 | 10 × `200` |

- Every voice response carries `current-concurrent-requests`, `maximum-concurrent-requests: 5` and `workspace-concurrent-requests`. The `current` value reached 5 in the voice-only runs and in 5 + 1 mixed runs.
- Alignment responses carry **no** concurrency headers.

## Findings

1. **Voice limit: 5, measured.** The 6th and 7th simultaneous voice calls were refused with `429` in both runs, always exactly the overflow, and the header states the same number. This confirms the documented Creator-tier limit.
2. **Alignment does not share that pool.** With five voice calls holding all five slots (header `current` = 5), a sixth call, an alignment, succeeded in 3 of 3 runs. Alignment alone also took 10 simultaneous calls without an error. The JOS-165 note that voice and alignment "share one account" is true for the character quota only, not for concurrent requests.
3. **Alignment has no limit found up to 10** concurrent calls. The real ceiling, if any, is above that and is irrelevant at the app's scale.
4. **Side finding, alignment latency under load.** Alignment took 1.9-2.7 s while voice calls were running, against 0.26-0.48 s on its own (here and in JOS-165). In the first mixed run, when ElevenLabs was slow (voice calls 1.6-6.9 s), all 3 alignment calls reached the adapter's 5 s limit and ended `failed_transient` with no response. The probe audio is 18 characters, so longer narration may take longer still. This does not concern the request cap but it does concern `maxTimeSeconds.alignment` (5 s); it is recorded as an open item for step 4.

## Derivation (design Decision 4)

| Stage | Measured limit | Cap |
|---|---|---|
| voice | 5 concurrent (shared only with other TTS calls on the same key) | **5** (currently 3) |
| alignment | none found up to 10; independent of voice | no derivation possible; **2 is kept** unless the owner prefers otherwise (calls last about 0.3 s, so 2 slots already move well over 100 requests per minute) |

Caveats: the limit is per ElevenLabs workspace, so another process using the same key (for example a second app instance) takes slots from the app; a `429` is classified as transient and retried, so the cost is a delayed retry, not a failure. Only the developer's Creator account was measured.

## Outcome

- Steps 2.1-2.3: PASS
- Consequence for the spec: the requirement "voice and alignment together SHALL NOT exceed the limit" is based on a premise that the probe disproved; it needs rewording in step 4.3 (not before the owner decides).
- Spend: ElevenLabs characters only; no money.
