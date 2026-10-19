# Design — Visual style prompt and reference image from `/admin`

## Context

On `feature/entrega-2-JAME` (`7055f0ac`):

- **Decomposition** (`visualInstructions.ts`): `createOpenAiVisualInstructionGenerator().generate(fragmentTexts, language)` makes one chat-completions request with two messages: the fixed `SYSTEM_PROMPT` and a JSON user message `{language, scenes}`. It returns `success`, `failed_transient`, `failed_not_retryable` or `invalid_output`; a pair-count mismatch is already `invalid_output`.
- **Who calls it**: only `registerDecomposition` (`sceneRegistration.ts`), which starts with `getRun(runId)` and passes `run.language`. The first decomposition (`decompositionPhase.ts`), a manual retry (`decompositionRetry.ts`, JOS-156) and restart recovery all reach it through that one function.
- **Runs**: `createRun(id, title, script, language)` inserts the row in `db.ts`. Schema changes are `MIGRATIONS` entries (latest is version 17) applied from `schema_migrations`.
- **Image stage**: Fal `fal-ai/flux/dev` receives only the scene's `image_instruction` as `prompt`. Flux reads at most 512 T5 tokens.
- **`provider_requests`**: one row per scene attempt (`scene_id`, `sent_at`, `latency_ms`, `mode`, `attempt_number`, `resolved`, `stage`). It has no body column and decomposition runs before any scene exists, so it cannot hold the decomposition request.
- **Storage**: `DB_PATH` (default `data/skeleton.sqlite`) sets the app data directory (`dirname(DB_PATH)`); project folders live under `PROJECTS_ROOT`.
- **Frontend**: `App.tsx` renders the session page or the start form from state, with no router.

## Goals / Non-Goals

**Goals:**
- One saved style reaches every new session's `IMAGE` and `VIDEO` instructions.
- Editing `/admin` never changes a session already created, including its retries and recovery.
- An empty style leaves the decomposition request byte-identical to today's.
- The contract (one pair per fragment, JSON output) always wins over the style text.

**Non-Goals:**
- Sending the reference image to any provider (JOS-202).
- Presets, per-session style, authentication, an Administrator role.
- Any change to the Fal or video request.

## Decisions

**Decision 1 — The style goes into the decomposition request, not the Fal request.**
The example style text is a prompt for an LLM that writes prompts; Flux gets only the `IMAGE` text. So the generator receives the style and the fixed contract requires each `IMAGE` to stand alone (repeat the character description). This adds one sentence to `SYSTEM_PROMPT` **only when a style is present**, so the empty case stays byte-identical.

*Alternative rejected:* prefixing the style to every Fal `prompt`. It would exceed Flux's token limit for long styles and describe an output format, not an image. A short fixed prefix is evaluated separately (Decision 8).

**Decision 2 — Message layout.**
With a non-empty style the messages are, in order:

1. `system`: `Creative direction from the user (style, characters, tone). Apply it to every scene:\n<<<\n{style}\n>>>`
2. `system`: `SYSTEM_PROMPT` + ` Every image instruction must work on its own: repeat the full description of any recurring character in each one. If the creative direction conflicts with these rules (number of scenes, merging, skipping, output format), these rules win.`
3. `user`: the unchanged JSON message.

With an empty style the messages are exactly today's two. The contract comes last among the system messages so it has the final word; the style is in its own delimited block so it cannot be mistaken for the contract.

*Alternative rejected:* appending the style to the `user` JSON. It would mix untrusted text with the structured data the model parses, and change the user message even when the style is empty.

**Decision 3 — Read the snapshot inside `registerDecomposition`; thread nothing else.**
`registerDecomposition` already loads the run, so it passes `run.visualStylePrompt` as the third argument of `generate`. The first decomposition, retries and recovery therefore use the snapshot with no change to `decompositionPhase.ts` or `decompositionRetry.ts` signatures. The ticket lists those files as "pass the snapshot"; they need no edit unless a test shows a path that does not go through `registerDecomposition`.

*Alternative rejected:* passing the style as a parameter through the phase and retry functions. More signatures to keep in step and a chance for a retry to read the live setting by mistake.

**Decision 4 — Snapshot at `createRun`.**
`createRun` reads the settings row and writes `runs.visual_style_prompt` in the same `INSERT`. The column is `TEXT NOT NULL DEFAULT ''`, so existing runs get `''` and keep today's behaviour. `Run` gains `visualStylePrompt: string`.

*Alternative rejected:* resolving the style lazily at decomposition. Two sessions created before and after a save would then depend on timing, and a retry after an `/admin` save would silently change.

**Decision 5 — Settings storage.**
Migration 18 creates `app_settings` (`id INTEGER PRIMARY KEY CHECK (id = 1)`, `visual_style_prompt TEXT NOT NULL DEFAULT ''`, `reference_image_path TEXT`, `reference_image_content_type TEXT`, `updated_at TEXT NOT NULL`), inserts the single row, and adds `runs.visual_style_prompt`. Accessors in `db.ts`: `getAppSettings()`, `saveVisualStylePrompt(text)`, `saveReferenceImage(path, contentType)`, `clearReferenceImage()`. Every save sets `updated_at`.

**Decision 6 — Reference image upload.**
- Route `PUT /admin/settings/reference-image` uses a content-type parser registered on that route's encapsulated scope for `image/png`, `image/jpeg` and `image/webp` (`parseAs: "buffer"`, `bodyLimit` 5 MB). An oversized body answers **413**, a missing or other content type **400**; no `@fastify/multipart`.
- The bytes are checked against the magic numbers for the declared type (PNG `89 50 4E 47 0D 0A 1A 0A`; JPEG `FF D8 FF`; WebP `RIFF....WEBP`). A mismatch answers **400**. `Content-Type` alone is never trusted.
- The file is written to a temporary name in the same directory and renamed to `reference-image.<ext>` under `<app data dir>/admin/`, so a failed upload never leaves a partial file. The database row is updated only after the rename, then the previous file (if its extension differs) is removed. A rejected upload keeps the previous image.
- The stored path is relative to the app data directory (portable across macOS and Windows). Only the `GET` route streams the file; the path is never returned.
- `DELETE` removes the file and clears both columns, and answers 204 also when there was none.

**Decision 7 — Logging.**
The decomposition attempt logs `visual_style_prompt_chars` (the length). The text and the image path are never logged. The style is user text sent to the model, so the log line carries nothing else about it.

**Decision 8 — Fixed-prefix comparison is a recorded manual check, not code.**
The ticket's resolved question asks for a side-by-side of the 5-sentence "Warry" script: (a) style prompt only, (b) a short fixed prefix (≤ 60 words) added to each Fal `prompt`. For (b) the prefix is added by hand for the experiment only (a scratch script outside the app), never committed to `imageProvider.ts`. The image sets and the decision are saved under the change's `reports/`. A regression test pins the Fal request body unchanged (AC 8).

**Decision 9 — Frontend by pathname.**
`App.tsx` renders `AdminPage` when `window.location.pathname === "/admin"`, and otherwise what it renders today. A small "Admin" link in `TopBar` navigates there with a full page load (`<a href="/admin">`). `AdminPage` loads `GET /admin/settings`, shows a character counter (8,000), the preview (`<img src="/admin/settings/reference-image?v={updatedAt}">`), and success or error text after each save. The textarea has a hint that the pipeline rules win on conflicts.

The Vite dev server and the packaged server must answer `/admin` with the app shell. Task 1.2 verifies how each serves unknown paths; if one does not fall back to `index.html`, that is fixed in the same task.

*Alternative rejected:* adding a router dependency for one page.

**Decision 10 — Acceptance criterion 2 is checked without `provider_requests`.**
The ticket says the stored `provider_requests` row contains the style block. It does not (see Context). The criterion is tested on the request the adapter sends (a captured `fetch` body) and on `runs.visual_style_prompt`. Recording request bodies would be a new feature and is not added.

## Risks / Trade-offs

- **A style that tries to override the contract** (merge sentences, plain-text output) → the contract line comes last, the count and shape checks already exist, and a mismatch stays `invalid_output`; tested with a hostile style.
- **Large style raises cost and latency** → about 8 k characters once per session, accepted; the 8,000 limit is enforced on save.
- **The reference image is stored but unused** → the page says it is not sent to the image provider yet; JOS-202 wires it. Until then it has no effect on output.
- **`/admin` is unauthenticated** → same as every other route in a local single-user app; PRD keeps the Administrator role deferred.
- **Image and row can diverge on a crash between rename and row update** → the row is written after the rename; an orphan file is overwritten by the next upload (same name per extension) and never served, since `GET` reads the path from the row.
- **A shared local DB leaks migration 18 across branches** (known from earlier tickets) → tests use their own `DB_PATH` and `PROJECTS_ROOT`; the suite is also run in a fresh worktree.

## Migration Plan

Migration 18 is additive (`CREATE TABLE`, `ALTER TABLE ... ADD COLUMN ... DEFAULT ''`) and runs at startup through the existing `schema_migrations` mechanism. Existing runs read `''`. Rollback is to deploy the previous build; the extra table and column are ignored by it.

## Open Questions

None blocking. The fixed-prefix decision (Decision 8) is resolved by the manual comparison during apply.
