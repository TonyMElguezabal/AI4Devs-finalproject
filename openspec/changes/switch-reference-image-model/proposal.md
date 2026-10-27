# Switch the reference image model to Seedream v5 Pro edit

Linear-Issue: JOS-230 (follows JOS-202)

## Why

JOS-202 sends the admin reference image to `fal-ai/flux-2/edit`. The first full Windows run (2026-10-26, 53 scenes) showed that this model produces poor images for the scenes the decomposition writes as diagrams and dashboards: garbled text (scenes 26, 27, 35 and 12), a style that drifts between scenes, and a character that disappears or changes. It also made 74 failed image attempts (15 time-limit timeouts, 12 HTTP 429). A comparison of six Fal models on eight of the worst scenes (same prompts, same reference, one try each) found `bytedance/seedream/v5/pro/edit` clean in text and style, at the exact 1920x1088 size and $0.0675 per image, but slow: 133 s on average and 233 s at most, over the 120 s image limit set by JOS-202.

## What Changes

- The `imageReferenceModel` setting changes from `fal-ai/flux-2/edit` to `bytedance/seedream/v5/pro/edit`. Its request body has the same shape as today's reference request (`prompt`, `image_urls`, `image_size`, `output_format`), so the adapter is expected to need no code change; a real-provider check confirms it.
- `maxTimeSeconds.image` rises from 120 s to 300 s (decided by the product owner, 2026-10-26), for every image request, as in JOS-202 Decision 7.
- The tests, PRD §3 and §11.3/§11.5 and its change log, and the README table that pin the old values are updated. The model comparison is recorded as a report in this change.
- Requests without a reference are unchanged (`fal-ai/flux/dev`).

Non-goals: prompt changes (no visible text in image prompts, an explicit style line), a quality check or regeneration for bad images, a per-request time limit, and changing the concurrency settings.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. The `stage-execution-time-limit` spec names no number and `reference-image-generation` (JOS-202) names no model for requests with a reference, so no requirement changes; the model and the limit are settings values.

## Impact

- Backend: `backend/config/settings.default.json` (two values), the comments in `backend/src/config/providers.ts` that cite the old measurements.
- Tests: `backend/test/settings.test.ts`, `backend/test/image-provider.test.ts`.
- Docs: `docs/PRD.md` (new version, the previous one kept), `README.md` and `readme.md`.
- Cost: about $0.0675 per scene image against about $0.04 today; the image stage takes longer per image.
- Depends on JOS-202 (merged, PR #107).
