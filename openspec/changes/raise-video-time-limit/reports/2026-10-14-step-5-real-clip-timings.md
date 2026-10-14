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
