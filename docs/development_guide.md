# Development Guide

How to run Vid4You locally, test it, and how code moves from a feature branch to the UAT and production environments.

Vid4You is two packages in one repository: `backend/` (Fastify, `node:sqlite`, TypeScript run directly by Node with no build step) and `frontend/` (React and Vite). Product rules are in `docs/PRD.md`; backend and frontend conventions are in `docs/backend-standards.md` and `docs/frontend-standards.md`.

## Prerequisites

- **Node.js 26.4.0**, the version the repository is developed and tested with. The backend needs a release that has `node:sqlite` and runs `.ts` files natively (strip-only type removal), so it does not work on older LTS lines. No `engines` field is declared yet.
- **ffmpeg and ffprobe** (development only). The voice-over probe and the assembly adapter both use one resolver (`backend/src/config/ffmpeg.ts`): `FFMPEG_PATH` / `FFPROBE_PATH` if set, otherwise `/opt/homebrew/bin/ffmpeg` and `ffprobe` when they exist (`brew install ffmpeg` on macOS), otherwise the name on `PATH` (Linux, CI). Both must be installed, including on CI. The packaged app bundles both beside the executable and needs no install.
- **Git** and **npm**.

## Run it

Two ways to run, both on `127.0.0.1:3100`. Run one at a time: a second instance on the same port will not start.

### Packaged app (macOS)

This is what users get. Build it from the repository root, then start it:

```bash
node openspec/changes/define-production-deployment/poc/local/build.mjs
./openspec/changes/define-production-deployment/poc/local/out/Vid4You
```

- The app opens the page in your browser. A second launch opens the running app instead of starting another.
- Data lives in `~/Library/Application Support/Vid4You/` (`VID4YOU_DATA_DIR` overrides it). Keys go in `.secrets.json` in that folder.
- `VID4YOU_PORT` changes the port; `VID4YOU_NO_BROWSER=1` stops the browser opening.
- Release rules apply: no `/docs`, no test endpoints, no stubs. The one exception is `POC_MODE=stub`, which runs every provider as a stub and spends nothing; a stubbed session still produces a final MP4 with the real ffmpeg.
- Only macOS is built and tested so far. The Windows build is untested (task 6.20).

### Development mode

```bash
# backend: http://127.0.0.1:3100 (API docs at /docs)
cd backend
npm ci
npm start

# frontend: http://127.0.0.1:5173
cd frontend
npm ci
npm run dev
```

The frontend talks to `http://127.0.0.1:3100` unless `VITE_API_BASE` is set at build time. The backend listens on loopback only. With no `USE_STUB_*` switch set (see below), every provider is real.

### Your first real run

1. Put the four keys in the secrets file (next section).
2. Open the page, create a project, paste the script, and start it. The product's real size is a 1,500–1,800 word script: 8–12 minutes of narration and 30–50 clips.
3. Expect these measured times (2026-10-13/14, one clip at a time unless noted):
   - voice-over: about 2.5 minutes for 10,217 characters;
   - decomposition: 1–3.5 minutes (67 fragments took 208.6 s);
   - each clip: 6.5–12 minutes (394 s for 7 s, 661–730 s for 14 s), three in flight.
   A 30–50 clip session is roughly 1.5–2.5 hours of video stage. That is an estimate; a session of that size has not been timed.
4. Keep the laptop awake. Processing pauses while it sleeps or the app is closed and resumes on the next launch.
5. Every provider task is billed, and a timed-out clip is resubmitted, so a timeout costs a second task. Top up RunningHub before a long run. If a scene fails with `error 605`, the balance is empty: top it up, then use **Retry scene N** on that scene.

### Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Port 3100 is in use | Another Vid4You or program holds it. Stop it, or change the port (`VID4YOU_PORT` packaged, `PORT` in development). |
| A stage fails naming a role such as `IMAGE_APIKEY` | No key is stored on `/admin` for the provider the stage uses, and (for a provider created from the settings) none is in the environment or the secrets file. Enter it on `/admin` and retry the scene. |
| A scene fails with `error 605` | RunningHub balance is empty (see step 5 above). |
| macOS refuses to open the app on another Mac | The build is ad-hoc signed, not notarized (story L8). Right-click the app and choose **Open** once. |

### Provider credentials

A provider's API key is entered on `/admin` ("Providers", see below) and stored encrypted in the local database. The application asks for a key by the stage's role (`REASONING_APIKEY`, `VOICE_OVER_APIKEY`, `ALIGNMENT_APIKEY`, `IMAGE_APIKEY`, `VIDEO_APIKEY`) and the system answers with the key of the provider the stage is bound to, or of the active provider when it is not yet bound; no code names a vendor key. The variables below are the fallback for the five providers created from the settings, used only when no key is stored for them (a stored key wins).

The encryption key is the 32-byte file at `PROVIDER_KEY_PATH` (default `data/provider-keys.key`, created with mode 0600 on first use; the folder of the database in development). It protects the database copied or shared on its own, not someone who can read both files, so keep the two in different folders where you can.

Real provider calls need four keys. In development they are read from the environment first and from a git-ignored `backend/.secrets.json` second (the environment wins). The packaged app reads only the environment and `.secrets.json` in its data folder; a checkout's `backend/.secrets.json` is not used.

| Variable | Provider stage |
|---|---|
| `OPENAI_KEY` | decomposition (reasoning) |
| `ELEVENLABS_KEY` | voice and alignment |
| `FAL_API_KEY` | image |
| `RUNNINGHUB_API_KEY` | video |

Never put a key in the repository. A missing key fails the stage with a message naming the variable, never its value.

### Administrator password

`/admin` is protected by one shared password. It is not needed for anything else: the start page and the session pages never ask for it.

| Variable | Used by |
|---|---|
| `ADMIN_PASSWORD` | the `/admin` page and every `/admin/…` endpoint |

- **Where to set it.** Like the provider keys: in the environment, or as `"ADMIN_PASSWORD"` in the same git-ignored `.secrets.json` (the environment wins). It is never a settings value, and a settings file that contains it is rejected as an unknown key.
- **Restart to apply.** The app reads it when it starts (the secrets file is cached), so a new or changed password applies after a restart. While it is missing the app starts normally, `/admin` says "No Administrator password is configured" and every `/admin/…` endpoint answers `401`.
- **Use a strong one.** The app has no lock-out after failed attempts, and until the `Origin`/`Host` guard exists (story L3) a website open in your browser could try passwords against `127.0.0.1`. A long random password costs nothing here and closes that risk in practice.
- **Opening it.** Go to `/admin` directly (`http://127.0.0.1:5173/admin` in development). It is not linked from the regular pages. The page keeps the password in memory only, so a reload asks again. In the packaged app, serving `/admin` is part of story L6.
- **Calling the API by hand.** Send `Authorization: Bearer <password>`, for example `curl -H "Authorization: Bearer $ADMIN_PASSWORD" http://127.0.0.1:3100/admin/access`. The answer is `200 { "configured": true, "granted": true }`, or `401` with `reason` `not-configured`, `password-required` or `wrong-password`.

### Local state

| Variable | Default (relative to the backend working directory) | Holds |
|---|---|---|
| `DB_PATH` | `data/skeleton.sqlite` | the SQLite store (sessions, scenes, attempts) |
| `PROJECTS_ROOT` | `data/projects` | one folder per project: narration, images, clips, final MP4 |

`backend/data/` is git-ignored. Two checkouts that share it share its sessions and migrations, so point `DB_PATH` and `PROJECTS_ROOT` at separate directories when running a second checkout or the tests.

### Settings files

Providers and generation parameters are not compiled into the code. They are read **once, when the backend starts**, from two JSON files, and a change takes effect only after a restart (editing a file while the app runs changes nothing).

| File | Role |
|---|---|
| `backend/config/settings.default.json` | ships with the app and holds a complete, valid value for every setting (the values recorded in PRD §11.3). Do not edit it to configure an installation. |
| `SETTINGS_PATH` (default `data/settings.json`, relative to the backend working directory) | optional. Holds only the settings you want to change. It is merged over the defaults: objects merge key by key, and a list (`languages`) is replaced whole. |

Example `data/settings.json` that offers English only and lowers the video request cap:

```json
{ "languages": [{ "code": "en", "label": "English" }], "maxSimultaneousRequests": { "video": 1 } }
```

| Setting | Rule |
|---|---|
| `decomposition`, `voice`, `alignment`, `image`, `video` `.name` | the provider; must be one the build ships an adapter for (today `OpenAI`, `ElevenLabs`, `ElevenLabs`, `Fal.ai`, `RunningHub`) |
| `decomposition.model`, `image.model`, `voice.model`, `voice.voiceId`, `voice.voiceName`, `voice.outputFormat`, `alignment.endpoint`, `video.endpoint` | non-empty text. The provider's acceptance is not checked at start-up; a wrong value fails the first call |
| `voice.speed` | `"default"` or a number from 0.7 to 1.2 |
| `video.admittedDurationSeconds.min` / `.max` | whole seconds, at least 1, `min` not above `max` |
| `segmentation.lowerBoundSeconds` | positive, not below `video.admittedDurationSeconds.min` |
| `speedFactorLimit` | a number of at least 1 (the unsigned factor) |
| `maxTimeSeconds.<stage>` | for `decomposition`, `image`, `voice`, `alignment`, `video`, `assembly`: a positive number of seconds, or `null` for "not timed". The key is required |
| `maxSimultaneousRequests.<stage>` | whole number of at least 1, for `decomposition`, `image`, `voice`, `alignment`, `video` |
| `output.width` / `.height` / `.fps` | positive whole numbers; width and height even (H.264). An output above 2560×1440 is upscaled |
| `languages` | a non-empty list of `{ "code": two lowercase letters, "label": text }`, codes unique |

If anything is missing, empty, the wrong type, out of range, unknown, or inconsistent, the backend **does not start** and prints one line per problem, each naming its setting, for example:

```
Error: Invalid settings, the application cannot start:
  - languages: must have at least 1 item(s)
  - openaiApiKey: unknown setting
  - segmentation.lowerBoundSeconds: must not be shorter than video.admittedDurationSeconds.min
```

A problem never prints a value. **Credentials never go in these files**: a key such as `openaiApiKey` is rejected as an unknown setting. Keys stay in the environment or `.secrets.json` (see "Provider credentials"). Values outside this list (content check, image generation size, video generation tier, retry budget and delays) stay in `backend/src/config/providers.ts`. The Administrator password is not a setting yet: it arrives with the `/admin` story.

What a change does and does not touch: sessions already running keep their recorded durations, speed factors, warnings and language, and a scene already bound to a provider keeps that provider (bindings store the provider name, so a retry uses the *current* model or endpoint). A language removed from the list can no longer start a new session, but existing sessions in it still work.

### Providers on `/admin`

On `/admin` (behind the Administrator password) the Administrator manages the providers of every stage: "Providers" lists each stage's provider profiles (adapter type, key status, the reason a profile cannot be used) and adds, edits and deletes them; "Active providers" chooses which one a stage uses next. Everything applies without a restart.

- **A profile** is one use of an adapter type the app ships (Fal.ai, ElevenLabs, OpenAI, RunningHub): a name, the adapter's parameters (reasoning model; voice model, voice id, output format and speed; alignment endpoint path; image model; video endpoint path and admitted clip durations) and an API key. Several profiles per stage are allowed. A parameter never names a host: each adapter sends to its own vendor.
- **A price** (optional): each profile form ends with "Price per <unit>" and "Currency", the unit being the stage's billed unit (voice character, audio second, request, image, clip second). Enter both or neither; a price of 0 is a free provider, an empty price is *unpriced*. Clearing both fields makes the profile unpriced again. The price is an input to the estimated cost report only (JOS-227): it never goes to the vendor and never makes a profile unusable. The settings files do not take it.
- **The settings files** now only seed the first profile of each stage, the first time the app starts. Afterwards the provider sections of the files do not change a profile (one notice is logged if they differ). Every other setting (segmentation lower bound, speed limit, maximum times, request caps, resolution, languages) still comes from the files and needs a restart.
- **Choosing** a profile needs valid parameters and a key that can be found; otherwise the page says why.
- **Deleting** a profile that is the active provider is refused; one that sessions or scenes are bound to is retired (no longer offered, still used by what is bound to it); otherwise it is removed.
- **Binding:** a session or a scene binds to the active provider at its first attempt and keeps it for its automatic and manual retries; a change never regenerates a completed result. The admitted clip durations used for segmentation are the active video provider's.

To try the switch locally or write a test, register stub adapters through the registry seams (`setVoiceProviderRegistry`, `setImageProviderRegistry`, `setVideoProviderRegistry`, `setReasoningProviderRegistry`, `setAlignmentProviderRegistry`; reasoning and alignment fall back to `setDecompositionDependencies` for their default adapter) and reset them with the matching `reset…` function; or add profiles with `insertProfile` and let the default registries build from them. Tests that store a key set `PROVIDER_KEY_PATH` to a temporary folder. `backend/test/active-provider-binding-*.test.ts` and `backend/test/provider-registries.test.ts` show both patterns.

### Unblocking a session whose provider is down

When a stage failed on a provider that stays unavailable, the Administrator moves it on `/admin`:

1. Make a working provider the active one for that stage ("Active providers"), after adding it and its key under "Providers" if needed.
2. Open "Failed stages": it lists every failed stage that is bound to a provider other than the active one, with its cause. Click "Move … to {provider}". The move only binds the stage to the active provider; nothing is sent and nothing is regenerated.
3. Open the session (the link after the move) and retry the stage with its usual button ("Retry voice-over", "Retry decomposition", "Retry scene"). The retry goes to the new provider.

A moved clip chooses its requested duration again from the new provider's admitted durations, so its speed factor and warning can change; its narration interval does not. A failure that offers no manual retry is not listed, and a stage already on the active provider is not listed. Nothing moves by itself.

### Reading the provider-usage report

Once unlocked, `/admin` ends with a "Reports" section. "Period" offers "Last 7 days", "Last 30 days" (selected first), "All time" and "Custom range" (two dates read in the computer's time zone, from the start of the first day to the end of the last). The table has one row per stage and provider with attempts, successes, transient and not-retryable failures, timed-out attempts, success rate, median and 95th-percentile latency (nearest rank) and billed units; it comes from `GET /admin/reports/provider-usage?from&to`, computed on demand from the local store and read-only. Under it, the "Sessions" table (JOS-225) lists the sessions created in the period, newest first, from `GET /admin/reports/sessions?from&to`: title, creation time, state, whether it is paused, scenes, failed scenes, attempts, and the seconds to the voice-over and to the final video. The state is derived, never stored: "Failed in <phase>" when the session records a failure (it wins over everything else), "Final video ready" when an assembly attempt succeeded, otherwise "In progress". The "Scenes" button of a row opens that session's scenes (`GET /admin/reports/sessions/{sessionId}/scenes`): status, image and clip providers, image and clip requests, requested duration, speed factor and the two warnings. Neither report contains a script, prompt, instruction, narration or failure text; the title is the only text the User wrote.

What it counts: an attempt that was sent and has a final outcome, by the instant it was sent (`[from, to)`); a late success counts as a success. It leaves out attempts that are scheduled, in flight, superseded or cancelled, the voice provider's native timestamps (not an alignment call) and the stub-only `unrecoverable` and `flaky` scene modes. Billed units count successful attempts only: voice characters, audio seconds (alignment), one request (reasoning), one image, requested clip seconds. A provider with no attempt in the period has no row. Until JOS-222 records the provider on image and clip attempts, those rows follow the scene's current provider (the section says so), so a scene moved to another provider counts all its attempts for the new one. The report contains no key, script, prompt or failure text.

### Development-only switches

These exist for manual endpoint testing and **must never be set in UAT or production**. The backend treats any non-empty value, including `false` and `0`, as enabled, so leave them unset.

| Variable | Effect |
|---|---|
| `ALLOW_TEST_ENDPOINTS` | enables `POST /internal/test/quick-voice-over` and `POST /internal/test/quick-scene` |
| `USE_STUB_VOICE_PROVIDER`, `USE_STUB_VIDEO_PROVIDER`, `USE_STUB_ASSEMBLY_TOOL` | replace a provider with a stub (values are listed in `backend/src/server.ts`) |
| `RETRY_BASE_DELAY_SECONDS`, `RETRY_CAP_DELAY_SECONDS` | shorten retry delays |
| `CORS_ALLOWED_ORIGINS` | comma-separated extra origins allowed to call the API. By default only `http://127.0.0.1:5173`, `http://localhost:5173` and the backend's own address are; any other web page gets a 403 |

### Telemetry (opt-in)

Nothing is sent until the User ticks a box in the Privacy dialog. To see what would be sent without any account, point the build at a local receiver and turn the signals on:

```bash
# any server that answers 200 on POST /v1/metrics and /v1/logs works; log what it receives
VID4YOU_TELEMETRY_ENDPOINT=http://127.0.0.1:4318 npm start     # backend/
curl -X PUT http://127.0.0.1:3100/telemetry/consent -H 'content-type: application/json' \
  -d '{"errors":true,"providerUsage":true,"productUsage":true}'
```

Metrics are exported every 60 s and on SIGINT/SIGTERM. `VID4YOU_CHANNEL=production` with `VID4YOU_RELEASE_TAG=<old tag>` turns on the update check against the GitHub Releases API. The rotating log is `logs/vid4you.log` beside the store.

- **Relay.** `infra/telemetry-relay/` is a Cloudflare Worker that filters attributes and forwards to Grafana Cloud. `npx vitest run` tests it; `.github/workflows/telemetry-relay.yml` deploys it with the secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, and the Worker needs `GRAFANA_OTLP_URL` and `GRAFANA_OTLP_AUTH` (`wrangler secret put`).
- **Dashboards.** Import the JSON files in `infra/grafana/dashboards/` as described in `infra/grafana/README.md`. The cost panels use placeholder prices that must be replaced first.

## Test

```bash
# backend
cd backend
DB_PATH=/tmp/vid4you-test/s.sqlite PROJECTS_ROOT=/tmp/vid4you-test/projects npm test
npm run typecheck

# frontend
cd frontend
npm test
npm run typecheck
```

Notes from running the suites on a clean checkout:

- Set `DB_PATH` and `PROJECTS_ROOT` as above; the default `data/` paths are shared across all test files.
- `ffprobe` must be on `PATH`, otherwise the voice-over tests fail with "ffprobe is not installed".
- `providerConfig.test.ts` reads `docs/PRD-v1.4.md`, so the `docs/` tree must be present.
- `test/orchestrator.test.ts` is timing-sensitive and fails occasionally in a full run; rerun the file alone before treating it as a regression.
- The `*.contract.test.ts` files call real providers and are skipped when no key is set.

## Branches and release channels

Vid4You ships as a packaged application per platform that runs on the user's computer and calls the cloud AI APIs (`docs/adr/0007-deployment.md`, JOS-194). There are exactly two release channels:

| Channel | Branch | Published as |
|---|---|---|
| UAT | `feature/entrega-2-JAME` | pre-release, built once per source tree |
| Production | `main` | release containing the same files as the UAT pre-release for that source tree |

```
feature/jos-<n>-<name>  ──PR──▶  feature/entrega-2-JAME (UAT pre-release)  ──merge──▶  main (production release)
```

- Feature work branches from `feature/entrega-2-JAME` and merges back into it, never straight into `main`.
- A production release is published only for a source tree that already has a UAT pre-release, after a reviewer approves; otherwise it fails closed. The branch-to-channel mapping is declared in one place so it can change later.
- The pipeline that does this is a follow-up story (L7); until then, the proof-of-concept build is `node openspec/changes/define-production-deployment/poc/local/build.mjs` (macOS executable in `poc/local/out/`).
- Hosted options (Cloudflare Tunnel + VM, Cloudflare Containers) were evaluated and set aside; their evidence stays in the change's reports.

## Specifications

Behaviour is specified in OpenSpec (`openspec/`): each change has a proposal, specs, a design and a task list, and the documentation is the source of truth. Update the change artifacts before changing code that a spec covers.
