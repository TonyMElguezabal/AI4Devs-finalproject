# Step 9 Report - Real adapter check

- Date: 2026-10-26
- Change: switch-reference-image-model (JOS-230)
- Agent: Claude Sonnet 5.5

## What ran
One call through the production adapter, `createFalAiImageProvider({ loadKey })` from `backend/src/imageProvider.ts`, with the shipped defaults of this branch (`IMAGE_REFERENCE_MODEL` = `bytedance/seedream/v5/pro/edit`, image limit 300000 ms read from `phaseTimeoutMs("image")`), the Warry reference of the Windows run (`reference-image.jpg`, 1024x1536) and the unchanged `IMAGE` instruction of scene 26. The Fal key was read from the main checkout's `backend/.secrets.json` by a scratch script outside the repository and was never printed. One image, about $0.0675. A full session was not run because its voice and video stages bill other providers.

## Result
- The adapter returned `success` with a temporary URL; the downloaded file is a PNG of **1920x1088** (4.2 MB), so it passes the output check.
- Latency: **125 s**, above the previous 120 s image limit and well inside 300 s. With the old limit this request would have been cut off, which is the case the new limit covers.
- Request shape: the adapter sent the same body as before (`prompt`, `image_urls` as a data URI, `image_size` 1920x1088, `output_format` `png`) and Fal accepted it, so no adapter code change was needed (design Decision 2).
- Image (preview `reports/model-comparison/real-adapter-scene26.jpg`): the text is legible ("Future Tax Rate Impact", "Scenario: higher future tax rate.", the three steps and the gauge). The gauge dial has two small glitches (stray "%0" and "2%" at its left and right edges). Warry does not appear in this scene, as in the comparison run; a single sample says nothing about the character in other scenes.

## Cleanup
The scratch folder (script and full-size image) is deleted. `backend/data` is unchanged.

## Outcome
- Step 9 status: PASS
- Not covered: character consistency across a full session (that needs a full run).
