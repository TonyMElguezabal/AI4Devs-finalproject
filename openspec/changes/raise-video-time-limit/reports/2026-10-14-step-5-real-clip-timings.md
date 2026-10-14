# Step 5 — real timings from the first real script (raise-video-time-limit, JOS-197)

- Date: 2026-10-14 (UTC evening of 2026-10-13)
- Run: the packaged executable (`poc/local/out/Vid4You`, release mode, default data folder and port, real providers), the product owner's "Wealthy Warry — quitting at 55" script (about 1,300 characters), English, started from the UI in Chrome.
- Session `01M4W4294K86VRGKTW9JF6AHKK`.

## What happened
| Stage | Real time | Limit | Outcome |
|---|---|---|---|
| Voice-over (ElevenLabs, `eleven_multilingual_v2`) | about 25 s for 129.1 s of narration | 10 s | attempt 1 timed out at 10 s; attempt 2 was sent (a second billable call) and later superseded; attempt 3 cancelled; **attempt 1's late result was accepted at about 25 s** and the stage completed |
| Timestamps | native, instant | 5 s | success |
| Decomposition, visual instructions (OpenAI `gpt-6-astra`) | **74.2 s and 75.5 s** for the 11 fragments (170, 137, 144, 135, 199, 189, 145, 178, 139, 163, 93 characters), measured in two direct calls without the adapter's timeout | **20 s** | timed out at 20 s; session `failed`, phase `decomposition`, retryable. A direct call with the limit also timed out at 20.0 s twice, so a manual retry would fail again |
| Scene images, clips, assembly | not reached | | |

## Findings
1. **The decomposition limit (20 s) fails this script every time.** JOS-165 measured 6.41-8.47 s on a short script; the answer time grows with the number of fragments (11 here). A script twice as long will take longer still.
2. **The voice limit (10 s) was measured on a 142-character script.** For 1,300 characters the call took about 25 s. The stage recovered through the late-result rule, but the timeout sent a second, billable request that was then superseded.
3. The video limit (raised to 600 s by this change) was not reached in this run; the 344 s sample is from JOS-196's live check.
4. Nothing else broke: the narration hand-off started decomposition on its own, the credentials were read from the product's default data folder, and release mode exposed no test endpoint.

## Open
Raising the decomposition and voice limits is the same kind of product-configuration change as the video one (PRD §11.3). It is not done here without the product owner's decision.

## Measurements at the product's real script size (2026-10-13/14)

The product owner's real workload is a 1,500-1,800 word script, an 8-12 minute narration and 30-50 chunks. Two more direct measurements were made with the product's own adapters (the timeout signal removed so the real answer time shows):

| Stage | Input | Result |
|---|---|---|
| Voice-over (ElevenLabs `eleven_multilingual_v2`, native timestamps) | **10,217 characters, 1,740 words**, one request | accepted (above the documented 10,000-character figure); **151.1 s**; about 12.8 minutes of narration (12.28 MB at 128 kbit/s); native timestamps present |
| Decomposition (OpenAI, visual instructions) | **67 fragments**, 10,151 characters (the same text segmented over a 767 s narration) | **208.6 s**, 67 pairs returned; 11 fragments took 74-76 s, so the time grows sub-linearly with the number of scenes |

Decisions taken from them: decomposition, voice and video limits are all set to 600 s (margins 2.9x, 4x and 1.7x), provisional until a full-size session has been timed end to end.

## Not measured yet
- Video clips of 10-15 s (the only sample is a 5 s clip, 344 s).
- 30-50 clips at the stage's cap of 3 in flight: at about 6 minutes per clip that is roughly 1.5-2 hours of wall time for the video stage alone, and a RunningHub charge per clip.
- A script above 10,217 characters in one voice request (the documented limit is 10,000 and 10,217 was accepted; a 1,800-word Spanish script is about 11,000-12,000 characters).
- Assembly of 30-50 clips with a 10-12 minute narration (its limit is still undetermined).
