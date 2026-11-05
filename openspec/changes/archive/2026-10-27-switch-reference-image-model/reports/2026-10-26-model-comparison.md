# Report - Image model comparison for the reference image (JOS-230)

- Date: 2026-10-26
- Change: switch-reference-image-model
- Agent: Claude Sonnet 5.5

## Why
The first full Windows run (`Windows 2 full run 1 2026-10-26 16-01`, 53 scenes, `fal-ai/flux-2/edit`) produced images with garbled text, a style that drifted between scenes and a missing or changing character. The scenes that failed worst are diagrams and dashboards whose `IMAGE` instruction asks for labels and captions.

## Setup
- Reference: the run's `reference-image.jpg` (1024x1536), sent as a data URI.
- Prompts: the unchanged `scenes.image_instruction` of the run, for eight scenes: 26, 27, 28 and 35 (garbled text), 12 (garbled text, tiny characters), 32 (a near-photographic kitchen instead of a cartoon), 33 (only the backs of two heads) and 9 (paper-cut style, the character as an afterthought). The prompt is sent as the app sends it, except for the text-to-image variant, which gets one added sentence describing Warry (it has no reference input).
- One request per image and model, no retries by the model (a second pass re-sent only the requests that failed for a reason on our side, below). Fal prices from its pricing API on 2026-10-26.
- Judgment of text, character and style is the agent's own visual review of the contact sheets; the product owner confirmed the choice.
- Files: `Winrun_results/model-comparison/` (full images in `out/<model>/`, results in `results*.json`); the eight contact sheets are in `reports/model-comparison/sceneN.jpg` (first row: current image, Nano Banana Pro, Seedream v4.5, Ideogram; second row: GPT-image-1.5, Seedream v5 Pro text-to-image, Seedream v5 Pro edit).

## Results (8 scenes each)

| Model (endpoint) | Price | Output size | Latency avg (min-max) | Text | Character / style |
|---|---|---|---|---|---|
| `fal-ai/nano-banana-pro/edit` | $0.15 per image | 2752x1536 (16:9, passes) | 27 s (25-28) | clean in the six sheets viewed | Warry good in 26 and 12; generic cartoon people in 32 and 33 |
| `fal-ai/bytedance/seedream/v4.5/edit` | $0.04 per image | 3392x1920 (16:9, passes) | 32 s (23-72) | mostly clean; typos in scene 26 ("Withloral") and a literal "16:9" | Warry good in 32; no character in 26 |
| `fal-ai/ideogram/character` | $0.05 per image | 1344x768 (**fails**: the size was ignored) | 56 s (28-92) | garbled in 26, 27, 28, 35 and 12 | good face, text unusable |
| `fal-ai/gpt-image-1.5/edit` | up to about $0.20 | 1536x1024 (**fails**: 3:2, maximum of the endpoint) | 53 s (34-110) | clean | Warry good in 27 and 32 |
| `bytedance/seedream/v5/pro/text-to-image` | $0.0675 per image | 1920x1088 (passes) | 69 s (58-77) | clean | no reference input, so the face differs (expected) |
| **`bytedance/seedream/v5/pro/edit`** | $0.0675 per image | 1920x1088 (passes) | **127 s (84-233)** | clean in all eight | Warry present in 27, 28, 32, 33, 9 and (small) 12; absent in 26 and 35; one consistent paper-cut style |
| `fal-ai/flux-2/edit` (current, from the Windows run) | about $0.04 per image | 1920x1088 | 15-78 s in JOS-202; 74 failed attempts of which 15 time-limit and 12 HTTP 429 | garbled in 26, 27, 28, 35 and 12 | style drifts between scenes |

Notes:
- Scene 28 of Seedream v5 Pro edit renders a small label "WARREN BUFFETT WEALTH PLAN": the model recognises the person in the reference and writes the name. The prompt does not ask for it. Worth a prompt rule (no names) in a follow-up; not in this change.
- Seedream v5 Pro edit took 84 to 233 s. In the first pass two of its eight requests hit a 300 s client timeout and finished in 108 and 111 s when sent again (see below), so the latency depends on Fal's load.

## Flood of Fal's concurrent-request limit
The first pass sent all 48 requests at once; 30 of them got no result: Fal answered HTTP 429 "Reached concurrent requests limit of 20" or the request waited past the 300 s client timeout (a client timeout is recorded under the 429 status in `results.json`, so the two are not separable there). Only the requests with no result were sent again, three at a time per model. Timed-out requests may have been billed. Total spend is estimated at no more than about 6 USD.

## Decision
The product owner chose `bytedance/seedream/v5/pro/edit` (2026-10-26) and a 300 s image maximum time (the slowest request, 233 s, plus about 30%).

## Outcome
- Step 1 status: PASS (a model with clean text, a consistent style and a valid 1920x1088 output was found).
- Limits: eight scenes, one try each, the agent viewed six of the eight sheets before the product owner decided and the other two (9 and 28) afterwards; they agree with the decision.
