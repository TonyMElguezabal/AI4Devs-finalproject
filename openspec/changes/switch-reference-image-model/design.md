## Context

JOS-202 added `settings.imageReferenceModel` (default `fal-ai/flux-2/edit`), read by `config/providers.ts` as `IMAGE_REFERENCE_MODEL` and used by the Fal adapter for any request that carries a reference. Its design Decision 7 set `maxTimeSeconds.image` to 120 s for every image request. The Windows run of 2026-10-26 (`Winrun_results/Windows 2 full run 1 2026-10-26 16-01`) and the model comparison (`reports/2026-10-26-model-comparison.md`) are the evidence for this change.

## Goals / Non-Goals

**Goals:**

- Images with readable text, a consistent style and the reference character, for the scenes the decomposition writes as diagrams.
- No image request cut off by the time limit while the provider is still working.

**Non-Goals:**

- Changing prompts, adding a quality check, per-request limits or concurrency changes (see the proposal).

## Decisions

### Decision 1: `bytedance/seedream/v5/pro/edit` as the reference model

Six candidates ran on the same eight scenes with the same reference, one try each: `nano-banana-pro/edit`, `seedream/v4.5/edit`, `ideogram/character`, `gpt-image-1.5/edit`, `seedream/v5/pro/text-to-image` and `seedream/v5/pro/edit`. `ideogram/character` returned 1344x768 and garbled text; `gpt-image-1.5/edit` returns at most 1536x1024; the text-to-image variant has no reference input. Of the rest, the product owner chose Seedream v5 Pro edit for its clean text and consistent style (2026-10-26). It returns exactly 1920x1088 for `image_size: { width: 1920, height: 1088 }` and costs $0.0675 per image (Fal pricing API). *Alternative not taken:* `nano-banana-pro/edit` (27 s, $0.15, clean text, but weaker on the character in two scenes and about four times today's price).

### Decision 2: The adapter keeps its request body

`seedream/v5/pro/edit` accepts `prompt`, `image_urls` (data URIs work), `image_size` and `output_format`, the fields the adapter already sends. The adapter's error rule is unchanged (4xx other than 408 and 429 is not retryable; a 4xx on a request with a reference names the reference). The real-provider check runs one image through the production adapter to confirm it.

### Decision 3: Image maximum time 300 s

Observed with this model: 133 s on average and 233 s at most over eight scenes (retry timeout 540 s); in a first run under 48 parallel requests two requests hit a 300 s client timeout and finished in about 110 s when retried alone. The product owner chose **300 s** (2026-10-26): about 30% above the slowest request seen, 2.5 times the old limit. The cost is that a stuck request, including a plain `flux/dev` one (8 s normally), is given up after 300 s instead of 120 s. As in JOS-202 Decision 7, the limit applies to every image request. *Alternative not taken:* a second limit only for requests with a reference (keeps the short limit for the plain case but adds a setting, a schema entry and a branch in the adapter and the timeout accounting).

## Risks / Trade-offs

- [The character is still missing or generic in some scenes, whatever the model] → Recorded in the report; prompt changes are a separate ticket.
- [Higher cost and time per image] → About $0.0675 against about $0.04; at the observed 133 s average, 53 scenes at the configured image concurrency add minutes, not hours; the real figure is read from the next full run.
- [A 300 s limit delays the retry of a request that is really stuck] → Accepted by the product owner.
- [Fal's concurrent-request limit (20 per account) was reached by the comparison script] → The app caps image concurrency in settings; unchanged here, to be revisited if the next full run shows 429s.
