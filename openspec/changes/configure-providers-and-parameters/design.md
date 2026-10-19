## Context

`backend/src/config/providers.ts` is the single constants module for every provider and parameter value fixed by JOS-165 and later stories (backend-standards.md, "Constants"). Twenty-three modules import from it. The values are typed literals, so changing one means editing source and shipping a new build. PRD §2.1, §2.3 and §11 say this explicitly: "hardcoded, no configuration files".

The app runs on the user's own machine (macOS and Windows, ADR 0007). Per-user data (database, project folders, credentials file) lives in the per-user data folder. Today the backend reads `DB_PATH` and `PROJECTS_ROOT` from the environment, with repo-relative fallbacks. JOS-194 will point those fallbacks at the OS application-data folder.

Two product decisions were made on 2026-10-19 while this change was being proposed:

1. The Administrator password is deferred to the story that adds `/admin` and the Administrator role.
2. Defaults ship with the app, and a per-user file overrides them, so a fresh install starts.

## Goals / Non-Goals

**Goals:**

- Every AC3 value is read from settings files at start-up. A change applies after a restart.
- Invalid settings stop start-up with a complete list of problems.
- The code that reads `providers.ts` does not change: the same export names, now holding validated values.
- Credentials stay out of settings files.

**Non-Goals:**

- Administrator password, `/admin`, any interface or API for editing settings.
- Hot reload, or watching the settings files.
- More than one adapter per stage. Configuring the provider means choosing among adapters that already exist, and today there is one per stage.
- Making values outside AC3 configurable: moderation, image generation size, the video generation tier, the retry budget and delays, and the not-retryable failure flag.
- Moving the override file to the OS application-data folder. That belongs to JOS-194.

## Decisions

### Decision 1 — JSON, two files, deep-merged

- **Shipped defaults:** `backend/config/settings.default.json`. It is versioned in the repository and ships inside the app. It holds today's `providers.ts` values exactly, so behaviour does not change on upgrade.
- **Optional user override:** `process.env.SETTINGS_PATH ?? "data/settings.json"`, the same pattern as `DB_PATH`. `backend/data/` is already git-ignored. When JOS-194 moves the data-folder defaults, this path moves with them.
- **Merge rule:** a recursive merge of objects, where the override wins. Arrays and scalars are replaced whole. For example, an override `languages` list replaces the default list; it is not appended to it.

**Alternatives:** YAML or TOML would allow comments, but both need a new dependency. `.env` variables are flat and untyped, and do not suit nested per-stage values. A single required user file was rejected by the product owner (fresh installs would not start). JSON with documentation in `docs/development_guide.md` is enough.

### Decision 2 — One zod schema, strict, with cross-field checks; collect all issues

`backend/src/config/settings.ts` defines the schema with `zod`, which is already a dependency. The schema is `.strict()` at every level, so unknown keys are errors. That catches typos and any credential-like key (spec: "Credentials never come from settings files"). A `superRefine` adds the consistency checks: the lower bound is at least the admitted minimum, the minimum is at most the maximum, language codes are unique, and output width and height are even, which H.264 requires.

`loadSettings({ defaultsPath, overridePath }): { ok: true; settings } | { ok: false; problems: string[] }` is a pure function:

- A missing override file is not a problem.
- A non-JSON override file is reported as one problem.
- Every zod issue becomes `"<dotted.path>: <message>"`.
- A message never includes a received value, so a stray key cannot leak through the report.

**Alternative:** hand-written validation. Rejected: zod already reports every issue in one pass, so it gives "list every problem" without extra code.

### Decision 3 — `providers.ts` keeps its exports, derived from the loaded settings

At module load, `providers.ts` calls `loadSettings`. If the result is `ok: false`, it throws one `Error` whose message is the joined problem list. Because the server imports this module before it listens, an invalid file stops `node src/server.ts` and the packaged app with a non-zero exit, before anything is served. That is "does not start".

The settings fill the existing exports:

- `DECOMPOSITION_PROVIDER`, `VOICE_PROVIDER`, `ALIGNMENT_PROVIDER`, `IMAGE_PROVIDER`, `VIDEO_PROVIDER`
- `VIDEO_ADMITTED_DURATION_SECONDS`, `SEGMENTATION_LOWER_BOUND_SECONDS`
- `SUPPORTED_LANGUAGES` / `SUPPORTED_LANGUAGE_CODES`
- `FINAL_OUTPUT` (width, height and fps come from settings; the codecs stay literal)
- `MAX_SIMULTANEOUS_REQUESTS`, `PER_PHASE_MAX_TIME_SECONDS`, `SPEED_FACTOR_LIMIT`

The derived values stay derived: `VIDEO_ADMITTED_DURATIONS_SECONDS` and `SEGMENTATION_UPPER_BOUND_SECONDS` still come from the admitted range, so they cannot drift apart. Values outside AC3 keep their literals in the same module.

**Alternative:** inject a settings object into every consumer. Rejected: it would touch 23 modules for no behaviour gain. The tests that need different values already inject them (`timeoutMs`, `limits`, and the retry delays).

### Decision 4 — Provider name is a per-stage literal union of shipped adapters

Each stage's `name` is validated against the names of the adapters that stage ships: `"OpenAI"`, `"ElevenLabs"`, `"ElevenLabs"`, `"Fal.ai"`, `"RunningHub"`. The model, endpoint, voice id, output format and speed are configurable values on the selected provider. Adding a second adapter for a stage later only widens that union.

### Decision 5 — Field-level rules

| Setting | Rule |
|---|---|
| `video.admittedDurationSeconds.min/max` | positive integers, min ≤ max |
| `segmentation.lowerBoundSeconds` | positive number ≥ `video.admittedDurationSeconds.min` |
| `speedFactorLimit` | number ≥ 1 (the unsigned factor, as recorded by JOS-148) |
| `maxTimeSeconds.<stage>` | positive number, or `null` = not timed (spec: stage-execution-time-limit). The key itself is required, so a missing key is an error, not "untimed" |
| `maxSimultaneousRequests.<stage>` | integer ≥ 1 |
| `output.width/height/fps` | positive integers, width and height even |
| `languages` | non-empty array of `{ code: /^[a-z]{2}$/, label: non-empty }`, codes unique |
| `voice.speed` | `"default"` or a number from 0.7 to 1.2 (the range ElevenLabs accepts) |
| `voice.outputFormat`, model ids, `voiceId`, `endpoint` | non-empty strings. Whether the provider accepts them is not checked at start-up; a wrong value fails the first real call |

`SupportedLanguageCode` widens from `"en" | "es"` to `string`. `routes.ts` builds its request enum from the validated, non-empty list (`z.enum(codes as [string, ...string[]])`). The response field is already `z.string()`, so an existing session in a language that has since been removed can still be read.

### Decision 6 — Established work is untouched by construction

Requested durations, speed factors, warnings, intervals and language are stored per chunk and per session when they are established, and they are never recomputed from the constants. Provider bindings (`runs.voice_provider_id`, `scenes.video_provider`) store the provider name, which only one adapter per stage can have. This change therefore adds no migration. It adds tests proving that a restart with different settings leaves an existing session's stored values unchanged.

## Risks / Trade-offs

- **A changed model id applies to the retries of an already-bound stage.** The binding stores the provider name, not the model. §11.2 binds the *provider*, so this is compliant, but a retry may run on a different model than the first attempt. → Documented in the development guide. Storing the model per binding is left until it causes a real problem.
- **Provider-specific values are not checked against the provider at start-up** (output format, model id, voice id). → A wrong value fails the first call, visibly, through the existing retry and failure path. Checking at start-up would need network calls and credentials at boot.
- **JSON has no comments.** → `docs/development_guide.md` documents every key, and the defaults file is the worked example.
- **A throw at import time crashes test files that import `providers.ts` if the defaults file is broken.** → One test validates the shipped defaults file itself. A broken default fails loudly in CI, which is the intent.
- **Output above the video generation tier (2560×1440) would be upscaled.** → Not blocked. The Administrator's choice, noted in the guide.

## Migration Plan

1. Ship `settings.default.json` holding today's literal values. Behaviour is identical with no override file.
2. Rollback means reverting the commit. No data migration either way.

## Open Questions

- PRD v1.10 (§2.1, §2.3, §11, §16) needs the product owner's approval before merge, as JOS-199's addendum did.
