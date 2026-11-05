# Step 9 Report - Real adapter check

- Date: 2026-10-26
- Change: use-reference-image-in-generation (JOS-202)
- Agent: Claude Sonnet 5.5

## What was run
`createFalAiImageProvider(...).generate(instruction, reference)` from the real source, once per scene, with the three Warry scene instructions and the Warry WebP as the reference, then `downloadGeneratedImage` and the product's own output check (`readImageDimensions`, `isAcceptedImageSize`). The adapter was given a 120 s timeout, not the stage's configured 25 s. A full session was not run: its voice and video stages bill other providers.

## Results
| Scene | Latency (request + download) | Output | Accepted by the output check |
|---|---|---|---|
| 1 | 76.5 s | 1920x1088, 3.15 MB PNG | yes |
| 2 | 77.6 s | 1920x1088, 3.01 MB PNG | yes |
| 3 | 50.5 s | 1920x1088, 3.06 MB PNG | yes |

The character matches the reference in all three (face, hair, glasses, navy suit, red tie), the scene elements follow the instruction, and the labels render. The visual judgment is the agent's; see `reports/spike/` for the earlier previews.

## Finding: latency exceeds the image stage's maximum time
The spike measured 15 to 18 s per image (and 25 s for the 4.9 MB reference). This run took 50 to 78 s per image for the same reference and prompts, probably queueing at Fal at the time. The image stage's maximum time is **25 s** (`maxTimeSeconds.image`, PRD §11.3), and the adapter aborts at that limit, so with the shipped settings a request with a reference would often be cut off as a transient failure and retried until the budget is spent, although Fal would have answered. This needs a decision before the change can ship: see design Decision 7 and task 3.8.

## Outcome
- Step 9 status: PASS for the adapter path and output size; **the time limit is an open item** (task 3.8).
- Spend: 3 images at about $0.04 each.
