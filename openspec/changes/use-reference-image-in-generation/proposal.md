# Send the `/admin` reference image to the image provider

Linear-Issue: JOS-202

## Why

JOS-201 added an optional reference image on `/admin` but only stores it; the page says "It is stored, but not sent to the image provider yet." The image model, Fal `fal-ai/flux/dev`, is text-to-image and cannot use one. The person producing videos wants the same character (for example "Warry") in every scene image, which the style prompt alone only approximates because the image stage receives just the scene's `IMAGE` text. PRD §11 requires a spike before a provider or model choice is made, so the change starts with one.

## What Changes

- **Spike first (gate for the rest):** compare Fal models that accept a reference image against today's `flux/dev` with the 5-sentence "Warry" script from JOS-201: character consistency across the five images, whether the reference overrides the scene's `IMAGE` instruction, latency, cost per image, 16:9 output size, how the reference is sent (data URI or uploaded URL) with its size limits, and error and HTTP behavior. The report is recorded in this change; the chosen model goes into the settings with values traced to it.
- **Reference travels with the request:** the image port becomes `generate(instruction, referenceImage?)`. With a reference the adapter calls the reference-capable model; without one the request body is byte-identical to today's.
- **Snapshot per session:** `createRun` copies the current reference image into the session's project folder and records its content type and SHA-256 on the run, like the style prompt in JOS-201. Retries and restart recovery read the snapshot, so changing or removing the image on `/admin` never affects a session in progress.
- **Clear failure when the provider rejects the reference:** a 4xx (other than 408, 429 and the authentication errors) on a request that carried a reference fails that scene as not retryable with a reason naming the reference; other scenes are unaffected.
- **The video stage is unchanged.** It already starts from each scene's generated image.
- **Admin page copy** no longer says the image is not sent.
- **Docs:** `docs/data-model.md`, `docs/api-spec.yml` if any response changes, PRD §11, and the spike report.

Non-goals: sending the reference to the video provider; several reference images; per-session upload; changing the style-prompt behavior; choosing a model before the spike.

## Capabilities

### New Capabilities

- `reference-image-generation`: the per-session reference image snapshot, its use in every image request of that session and in retries and recovery, the unchanged request when there is none, and the failure rule when the provider rejects it.

### Modified Capabilities

None in `openspec/specs/`. The settings and decomposition behavior it builds on is specified by the JOS-201 change (`admin-visual-style-prompt`), which is applied but not yet archived; this change does not alter any of its requirements except removing the "stored only" notice.

## Impact

- Backend: `imageProvider.ts` (port, Fal adapter, stub), `orchestrator.ts` (image launch passes the snapshot), `db.ts` (migration and `createRun`), `config/settings.default.json` and `config/providers.ts` (reference model), the image provider profile parameters.
- Frontend: the notice in `VisualStyleSection.tsx` and its test.
- Data: new nullable columns on `runs` for the snapshot (path, content type, hash); no new table.
- Cost: the spike makes real Fal calls (a handful of images per candidate model).
- Depends on JOS-201 being merged (it is on `main`).
