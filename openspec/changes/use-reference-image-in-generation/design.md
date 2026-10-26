## Context

JOS-201 (`admin-visual-style-prompt`, applied, on `main`) stores one optional reference image in `app_settings` (`reference_image_path` relative to the app data directory, `reference_image_content_type`, PNG/JPEG/WebP up to 5 MB) and copies the style prompt onto each run at creation (`runs.visual_style_prompt`). Nothing reads the image.

Current image path:

- `ImageProvider.generate(instruction)` (`imageProvider.ts`) is one synchronous POST to `https://fal.run/<model>` with `{ prompt, image_size: 1920x1088 }`; the model comes from the image provider profile's parameters (JOS-218), defaulting to `settings.image.model` (`fal-ai/flux/dev`, text-to-image only).
- The orchestrator launches the image stage with `adapter.generate(fresh.imageInstruction)` (`orchestrator.ts`), classifies the result (4xx other than 408 and 429 is not retryable) and downloads the returned URL to a project file.
- Retries and restart recovery re-enter `launchImageStage`, so a value read there at launch time is automatically what retries and recovery use.
- PRD §11 requires a spike before a provider or model choice.

## Goals / Non-Goals

**Goals:**

- Same character across the scenes of a session, using the saved reference image.
- A session's reference never changes after creation (retries and recovery included).
- No change to the request when there is no reference.
- The model and request shape are decided by measurement, not assumption.

**Non-Goals:**

- Reference for the video provider, multiple references, per-session upload, or any change to how the style prompt works.

## Decisions

### Decision 1: Spike first, and the rest waits for it

Group 1 of the tasks is the spike. It runs the Warry script through `flux/dev` (baseline) and the candidate reference-capable Fal models (for example Flux Kontext, Flux Redux, image-to-image variants) and records, in `reports/`, the measurements listed in the proposal. Decisions 2 and 3 below describe the shape that holds for any candidate; the model name, the request body fields and the size limit were filled in from the report (done, task 1.7). If the spike shows no candidate keeps 16:9, follows the scene instruction and holds the character, the change stops there with the report as its result and the follow-up is a new ticket.

Per `CLAUDE.md` §7, anything the spike changes in this design is updated here and in the specs before code.

### Decision 2: The port takes the reference as data

```ts
type ReferenceImage = { bytes: Buffer; contentType: string; sha256: string };
interface ImageProvider { generate(instruction: string, referenceImage?: ReferenceImage): Promise<ImageGenerationResult>; }
```

The Fal adapter gains an option `referenceModel`, filled from a new top-level setting `imageReferenceModel` (`backend/config/settings.default.json`, exported as `IMAGE_REFERENCE_MODEL` from `config/providers.ts`). With a reference the adapter posts to `fal.run/<referenceModel>`; with none it sends exactly today's body to the profile's `model`. It is a setting, not a profile parameter, for two reasons: every `fal-image` profile uses the same vendor and key, so one reference model serves them all, and profiles already stored in a user's database (which keep their stored parameters) would otherwise lack it and fail. No `/admin` form field is added. The spike (`reports/2026-10-26-step-1-reference-model-spike.md`) chose `imageReferenceModel = fal-ai/flux-2/edit`, whose body is `{ prompt, image_urls: [<data URI of the reference>], image_size: { width: 1920, height: 1088 }, output_format: "png" }`. A data URI is enough: a 4.9 MB reference (6.6 MB encoded, the largest the app accepts) was accepted, so no upload step is needed. The response has the same `images[0].url` shape as `flux/dev`, so the existing response parsing and download path are reused. The stub adapters accept and record the argument so tests can assert it.

*Alternatives:* a `referenceModel` parameter on each profile (stored profiles lack it, and the form would need a field); a new adapter type for reference-capable models (two profiles to keep in step and an unbound-scene problem when a session has a reference but the bound profile does not); making the reference a module-level setting (hidden state; breaks the snapshot rule).

### Decision 3: Snapshot is a file in the project folder plus three columns on `runs`

`createRun` copies the saved image to `<project folder>/reference-image.<ext>` and stores on the run `reference_image_path` (relative to the project folder), `reference_image_content_type` and `reference_image_sha256`. These are nullable columns added by a migration numbered above the highest on `main` at apply time. A copy, not a pointer, because `/admin` replaces and deletes the original, and PRD §12.2's rule that project files are never deleted automatically means the copy survives. The hash identifies the image in logs and diagnostics; bytes are read from the project folder when the stage launches.

`launchImageStage` reads the file and passes the `ReferenceImage` to `generate`; if the file cannot be read, the scene fails as not retryable with a reason naming the missing file.

*Alternatives:* store only the hash and fetch from `/admin` at launch (breaks when the image changed); store the bytes in SQLite (grows the database by up to 5 MB per session for no benefit).

### Decision 4: The hash is on the run, not on each provider request

The ticket asks `provider_requests` to record a hash or reference id. A session's reference is immutable after creation and every image request of that session carries it, so the hash is already determined by the run; a column per request would store the same value many times and need its own migration. Requests are therefore attributed through the run's `reference_image_sha256`. The logs of the image attempt include the hash (never bytes). If the spike shows that models differ per request in a way that matters for reports, a column can be added later.

### Decision 5: Failure classification

The existing rule stays: 4xx except 408 and 429 is not retryable. The spike showed that `flux-2/edit` answers 422 for an undecodable reference, an unreachable reference URL and a missing reference, and 401 for a bad key. For a request that carried a reference, a 400, 413, 415 or 422 gets a reason naming the reference (`the image provider rejected the reference image (HTTP 422)`); 401 and 403 keep the existing wording because they are about the key. The response body is still never copied into the reason.

### Decision 6: Copy on the admin page

The sentence "It is stored, but not sent to the image provider yet." becomes "It is sent to the image provider with every scene of sessions created afterwards." (changes apply to new sessions only, which the page should say). The frontend test is updated with it.

### Decision 7: One higher maximum time for the image stage (decided by the product owner, 2026-10-26)

The real-adapter check (`reports/2026-10-26-step-9-real-adapter-check.md`) took 50 to 78 s per image with `flux-2/edit`, against 15 to 18 s in the spike and 8 s for `flux/dev`, while the image stage's maximum time was 25 s, so a request with a reference would often time out and retry although the provider would have answered. The product owner chose option (a): raise `maxTimeSeconds.image` for every image request, to **120 s** (the slowest observed, 78 s, with about 50% margin). The settings default, PRD §11.3 and the tests that pin the value change; the requirement in `stage-execution-time-limit` names no number, so no spec delta is needed. The cost is that a stuck plain `flux/dev` request (8 s normally) is now given up after 120 s instead of 25 s. *Alternative not taken:* a second limit used only for requests with a reference (keeps 25 s for the plain case, but adds a setting, a schema entry, a PRD row and a branch in the adapter and the timeout accounting).

## Risks / Trade-offs

- [The reference may override the scene's `IMAGE` instruction (the same pose in every scene)] → The spike measures it; if it is unacceptable, a prompt template or guidance-strength parameter is part of the chosen model's parameters.
- [A 5 MB image base64-encoded is a large request body for a synchronous call] → The spike records the provider's limits; Decision 2 allows an upload step if needed.
- [A reference-capable model costs more or is slower per image] → Recorded in the spike and in `config/providers.ts` with the report path; the time limit for the image phase is checked against the measured latency.
- [Sessions created before this change have no snapshot] → They run exactly as before (no reference); the nullable columns need no backfill.
- [The shared local database leaks migrations across branches] → The migration number is chosen against `main` when applying, and the test database is isolated.
- [Spike spends money] → A small, fixed number of images per candidate (the five Warry scenes), recorded.

## Open Questions

- Which model, field names, size limit and parameters: answered by the spike (task 1): `fal-ai/flux-2/edit`, data URI, no size limit reached at 4.9 MB. Fallback if it later disappears or misbehaves: `fal-ai/bytedance/seedream/v4/edit` (same output size, slower).
- The reference model costs about $0.04 per image at 1920x1088 (per processed megapixel, input included); confirm on the Fal billing page after task 9.1.
