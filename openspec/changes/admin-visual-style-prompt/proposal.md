# Set one visual style prompt for every scene from `/admin`

Linear-Issue: JOS-201

## Why

Every scene's `IMAGE` and `VIDEO` instruction is written by one reasoning request (`visualInstructions.ts`) whose system prompt has no style guidance. The person producing videos cannot make recurring characters or an art style consistent across scenes (for example "Warry, a 2D cartoon caricature in a navy suit…") without editing each scene by hand. The style belongs in that decomposition request: the image stage (Fal `flux/dev`) only ever receives the scene's `IMAGE` text, so the decomposition must repeat the character description in every `IMAGE`.

## What Changes

- **A singleton visual style setting**: `visualStylePrompt`, text of 0–8,000 characters, trimmed. Empty means "no style" and keeps today's request byte-for-byte.
- **An optional reference image**, uploaded on `/admin` (PNG, JPEG or WebP, up to 5 MB), stored on disk under the app data directory and previewed on the page. It is **stored only**: no provider receives it in this change (see Out of scope).
- **A snapshot per session**: `createRun` copies the current style onto the run. The first decomposition, its manual retries (JOS-156) and restart recovery read the snapshot, so saving `/admin` never changes a session in progress.
- **The decomposition request carries the style**: a delimited "creative direction" system message before the fixed contract, and a closing line saying the contract wins on any conflict (scene count, no merging or skipping, JSON output). With an empty style no message is added and the contract text is unchanged.
- **An `/admin` page** in the frontend (textarea, image upload with preview and remove, save with a success or error message), reached by path without a router, plus a small "Admin" link.
- **Five endpoints** under `/admin/settings` to read and save the prompt, and to upload, stream and delete the reference image.
- **A logged length, never the text**: the decomposition attempt logs `visual_style_prompt_chars`.
- **Docs**: `docs/api-spec.yml`, `docs/data-model.md`, and PRD §2.1/§2.3/§11 (the `/admin` visual style setting moves from deferred to delivered; the rest of the Administrator role stays deferred).
- **A manual comparison recorded in the change**: the 5-sentence "Warry" script run with the style prompt only, and with a short fixed prefix added to each Fal `prompt`. Only the comparison and its decision are recorded; the Fal request body does not change here.

## Capabilities

### New Capabilities

- `visual-style-settings`: the singleton style prompt and optional reference image: validation, storage, the five `/admin/settings` endpoints, the `/admin` page, and the rule that nothing sends the image to a provider yet.
- `visual-style-in-decomposition`: how the saved style reaches a session: the per-run snapshot taken at creation, its use by the decomposition, its retries and restart recovery, the message layout of the reasoning request, and the contract-wins rule.

### Modified Capabilities

None in `openspec/specs/`. `decomposition-manual-retry` (JOS-156) only says a retry repeats the failed step; reading the snapshot changes no requirement there.

## Impact

- **Backend**:
  - `db.ts`: one migration (`app_settings` table, `runs.visual_style_prompt`), the settings accessors, and the snapshot in `createRun()`.
  - `visualInstructions.ts`: `generate(fragmentTexts, language, visualStylePrompt)` builds the messages.
  - `sceneRegistration.ts`, `decompositionPhase.ts` and `decompositionRetry.ts`: pass the run's snapshot.
  - `routes.ts`: the five routes and a route-scoped raw-body parser (no new dependency).
  - The reference image file lives under the app data directory; the stored path is relative.
- **Frontend**: `App.tsx` (path switch and link), new `components/AdminPage.tsx`, fetch helpers in `api/client.ts`.
- **Docs**: `docs/api-spec.yml`, `docs/data-model.md`, `docs/PRD.md`.
- **Provider requests**: the decomposition request body grows by up to about 8 k characters, once per session. The Fal image request is unchanged (regression test).
- **Correction to the ticket**: it says the recorded decomposition request in `provider_requests` already holds the full message body. It does not: that table is per scene and has no body column, and decomposition runs before any scene exists. Acceptance criterion 2 is therefore checked on the request the adapter sends (a captured `fetch` body in tests) and on the run's snapshot column, not on a `provider_requests` row. No body-recording feature is added.
- **Depends on**: nothing unmerged. Branch `feature/jos-201-visual-style-prompt` is cut from the new integration branch `feature/entrega-3-JAME` (itself cut from `feature/entrega-2-JAME` at `7055f0ac`).
- **Out of scope**:
  - sending the reference image to a provider (JOS-202, which needs a spike on a reference-capable Fal model per PRD §11);
  - style presets or a style chosen per session;
  - authentication or an Administrator role: `/admin` is unauthenticated like every other route (local single-user app);
  - a fixed style prefix on the Fal request, unless the manual comparison clearly favours it, and then only as a follow-up ticket.
