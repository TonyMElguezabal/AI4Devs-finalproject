# Step 1 Report - Spike: image models that accept a reference image

- Date: 2026-10-26
- Change: use-reference-image-in-generation (JOS-202)
- Agent: Claude Sonnet 5.5

## Setup
- Reference image: the "Warry" caricature supplied by the product owner (1024x1536 WebP, 195 KB), sent as a data URI (`reports/spike/reference-warry.jpg` is a small preview).
- Prompts: the three `IMAGE` instructions the real decomposition produced for the 5-sentence Warry script (`admin-visual-style-prompt/reports/2026-10-20-step-10-1-real-script.md`), unchanged (`reports/spike/scenes.json`). The decomposition merged the five sentences into 3 scenes, so each model produced 3 images, not 5. One request per image, no retries.
- Script: `reports/spike/run.mjs` (reads `FAL_API_KEY` from `backend/.secrets.json`, never printed). Full-size images were not committed; small previews are in `reports/spike/`.
- Output size requirement: `imageOutputCheck.ts` accepts only images of at least 1920x1080, horizontal, within 1% of 16:9.
- Judgment of character consistency and scene adherence is the agent's own visual review of the images; the product owner should confirm it.

## Candidates
Selected from the Fal OpenAPI schemas of each endpoint (`https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=...`):

| Candidate | Reference field | Prompt | Output size control | Verdict before running |
|---|---|---|---|---|
| `fal-ai/flux/dev` (today) | none | yes | `image_size` | baseline |
| `fal-ai/flux-2/edit` | `image_urls` (array) | yes | `image_size` width/height | run |
| `fal-ai/flux-pro/kontext` | `image_url` | yes | `aspect_ratio` only | run |
| `fal-ai/nano-banana/edit` | `image_urls` | yes | `aspect_ratio` only | run |
| `fal-ai/bytedance/seedream/v4/edit` | `image_urls` | yes | `image_size` width/height | run |
| `fal-ai/flux/dev/redux` | `image_url` | **none** | `image_size` | excluded: no prompt, so a scene's `IMAGE` instruction cannot be followed |
| `fal-ai/flux/dev/image-to-image` | `image_url` | yes | none (follows the input image) | excluded: it transforms the reference, it does not place the character in a new scene |

## Results (3 scenes each)

| Model | Output size | Meets 1920x1080 and 16:9 | Latency per image | Unit price (Fal pricing API) | Character consistency | Follows the scene |
|---|---|---|---|---|---|---|
| `flux/dev` (no reference) | 1920x1088 | yes | 8, 8, 8 s | $0.025 per megapixel | **No**: a different face and a bald head in each image (preview `flux-dev-scene1.jpg`) | yes |
| `flux-2/edit` | **1920x1088** | **yes** | 16, 15, 18 s | $0.012 per processed megapixel | **Yes**: same face, glasses, hair, suit and tie in all 3 | yes; scene 2 has an awkward layout (the two timelines overlap) |
| `flux-pro/kontext` | 1392x752 | **no** (below 1920x1080) | 6, 6, 8 s | $0.04 per image | Yes | yes |
| `nano-banana/edit` | 1344x768 | **no** | 9, 8, 8 s | $0.0398 per image | not reviewed (excluded on size) | not reviewed |
| `seedream/v4/edit` | 1920x1088 | yes | 29, 22, 31 s | $0.03 per image | Yes, but the style drifts a little from the reference in scene 1 | yes |

`flux-2/edit` is priced by processed megapixels, input included: about 2.1 MP out plus 1.6 MP in for this reference, so roughly $0.04 per image at the 1920x1088 size; the real cost per session is to be confirmed on the Fal billing page after the real-provider check (task 9.1). Today's `flux/dev` costs about $0.05 at the same size.

## Reference transport and limits
- A **data URI** in the reference field works for every candidate; no upload step is needed.
- WebP, PNG and JPEG are accepted (the Warry reference is WebP).
- A 4.9 MB PNG (6.6 MB as a data URI, the largest the app accepts) was accepted by `flux-2/edit` in 25 s; no body limit was reached.

## Error behavior (`flux-2/edit`)
| Case | HTTP | Note |
|---|---|---|
| Reference is not a decodable image (corrupt data URI) | 422 | message says the image has an unsupported format |
| Reference URL cannot be downloaded | 422 | `file_download_error` |
| Reference field missing | 422 | field required |
| Invalid API key | 401 | |
| Empty prompt | **200** | the provider generated an image anyway (a small cost incurred by the probe); not a rejection |

This keeps the existing rule: every 4xx except 408 and 429 is not retryable. A 422 on a request that carried a reference is the case the spec names; the 401 case is the key.

## Decision
**Use `fal-ai/flux-2/edit`** with `{ prompt, image_urls: [<data URI of the reference>], image_size: { width: 1920, height: 1088 }, output_format: "png" }` when a session has a reference, and keep `fal-ai/flux/dev` with today's body when it has none. It is the only candidate that holds the character, follows the scene and returns exactly 1920x1088 within a reasonable time. `seedream/v4/edit` is the fallback (slower and less faithful to the reference's style). `flux-pro/kontext` and `nano-banana/edit` would need an upscale step to pass the output check and are not recommended.

## Known risks recorded for the design
- Scene 2 of `flux-2/edit` shows the reference can still produce an awkward layout for complex scenes; the real-provider check (task 9.1) repeats this with the final code.
- The consistency judgment is the agent's; the owner should look at `reports/spike/flux-2-edit-scene1.jpg` and `flux-2-edit-scene3.jpg` against `flux-dev-scene1.jpg`.

## Outcome
- Step 1 status: PASS (a qualifying model exists).
- Spend: about 15 images across the five models plus 3 probe calls and one 4.9 MB probe, under 1 USD at the listed prices.
