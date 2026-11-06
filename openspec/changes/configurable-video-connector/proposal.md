## Why

Video models keep coming out (Wan, Kling, Veo, Seedance, ...), each served by its own vendor API. Today each vendor API needs a coded adapter: the video stage ships only `runninghub-video`, so adding a model on another vendor means a code change and a release. The owner wants one video connector in code, with each vendor's way of calling described by the Administrator on `/admin`, so a new vendor or model is a configuration, not a release. JOS-219 ("a second real provider") is reshaped to deliver this, proven with two real vendors.

## What Changes

- **A configurable video connector, adapter type `configured-video`.** It implements the video stage's existing submit-and-poll port, so binding, retries, moves, time limits, restart recovery, the clip request status and the reports work for it unchanged. What changes per vendor is a **definition** the Administrator writes in the profile:
  - a base URL (`https` only) and the authentication headers, with `{key}` where the key goes;
  - an optional **upload** step that sends the scene image first and reads back its URL (RunningHub needs this);
  - a **submit** step: method, path, JSON body template, and where the task id is in the answer;
  - a **poll** step: method, path and optional body with `{task_id}`, where the status is, which status values mean done and which mean failed, where the video URL is, and where an error code is;
  - an optional **connection check** step: one free request and the status that means the key is good.
- **Placeholders** fill the templates: `{instruction}`, `{duration}`, `{model}`, `{resolution}`, `{image_data_uri}`, `{image_base64}`, `{image_url}` (after upload), `{task_id}`, `{key}`. The connector sends only what the template names, so vendors that refuse unknown fields (Kling on Runway) work.
- **One definition, several models.** A profile holds one definition and one model. "Duplicate" on `/admin` copies a profile with the same definition for another model (for example `wan3`, then `kling_4`), and can reuse its key when the host is the same.
- **The key stays tied to its host.** `{key}` may appear only in headers. Changing a profile's base URL host clears its stored key, so a key can never be redirected to a new host without being typed again.
- **Proof with two real vendors, with no vendor code:**
  - **Runway** (`api.dev.runwayml.com`): Wan 3.0 (`wan3`) and Kling 4.0 (`kling_4`). This is the plain submit-and-poll case with the image as a data URI.
  - **RunningHub through the connector**: MiniMax Hailuo H3 with the upload step. This is a second RunningHub profile next to the coded one, with the same results.
- **The video stage builds each profile with the adapter of its own type**: the coded RunningHub adapter or the connector. Today every video profile is built as RunningHub.
- **The shortest-clip rule applies to every video adapter type**, as the requirement already says. Today the code checks it only for RunningHub.
- **Telemetry names a connector's vendor by its host** (for example `api.dev.runwayml.com`). The free-text label is still never sent.
- **Video quality is capped at 1080p to keep cost down** (owner decision, 2026-11-06). Today RunningHub clips are 2K at $0.12 per second, and the app scales them down to 1080p anyway.
  - The final video is **720p (1280×720) or 1080p (1920×1080)**, set in the settings files. 1080p is the default, and any other size stops the app at start-up.
  - Each video profile names its clip resolution, and nothing above 1080p is accepted. RunningHub requests **768P** (1344×768, about 36% cheaper than 2K), including the existing seeded profile. A connector resolution that names 2K or above is refused.
  - A clip smaller than the final video is scaled up by the assembly.
- **Unchanged:** the coded `runninghub-video` adapter stays seeded and active by default. Retiring it in favour of its connector definition is a follow-up, once parity is shown.

Non-goals:
- Logins that are not a fixed key: OAuth or service-account tokens (for example Veo on Google Vertex) and signed requests (for example AWS).
- Vendors that need the image at a public URL the app would host.
- Webhooks, and calls that hold the connection open until the clip is ready.
- A video returned as bytes in the answer rather than as a link.
- More steps than upload, submit and poll.
- Connectors for the other stages.
- A shared library of ready-made definitions.

The Cloudflare `minimax/h3` model may fit the connector if Cloudflare accepts a data URI and has a task read. That check is not part of this change.

## Capabilities

### New Capabilities

- `configured-video-connector`: the definition a video profile holds (base URL, headers, upload, submit, poll and check steps, placeholders, paths, status mapping), how the connector runs it and classifies the answers, how the key is bound to the host, and duplicating a profile for another model.

### Modified Capabilities

- `provider-profiles`: a stage builds each profile with the adapter of the profile's own type, the shortest-duration rule applies to every video adapter type, and a video profile requests clips of at most 1080p.
- `final-video-assembly`: the final video is 720p or 1080p from the settings, with subtitles scaled to the frame.
- `runninghub-video-adapter`: the clip resolution comes from the profile and is `768P`, not the fixed `2K`.
- `provider-connection-test`: a connector profile is checked with its definition's own check step, and one without a check step says so and sends nothing.

## Impact

- Backend:
  - a new `videoConnector.ts`: template filling, path reading, the three steps, classification;
  - `videoProvider.ts`: the adapter table per video type;
  - `providerTypes.ts`: the definition schema and the form;
  - `providerConnectionCheck.ts`: the definition's check;
  - `providerAdmin.ts`: the duration rule, clearing the key on a host change, duplicating a profile;
  - `db.ts`: the telemetry vendor;
  - `stageDiagnostics.ts`: the model shown;
  - `config/settings.ts`: the two accepted output sizes;
  - `config/providers.ts`: the fixed `2K` generation setting is removed;
  - `subtitles.ts`: probably no change. libass scales the 1920×1080 subtitle frame to the video, and a 720p render confirms it;
  - the shared adapter contract fixtures.
- Frontend: the `/admin` profile form gets a new field kind, a JSON text area for the requests (headers and steps), and plain fields for the base URL, model, resolution and durations. It also gets a "Duplicate" action and a warning that changing the host clears the key.
- Docs: a new `docs/video-connector-definitions.md` holds the Runway and RunningHub definitions as worked examples. The tests use the same files as fixtures.
- API: `GET /admin/provider-types` lists the new type. `POST /admin/provider-profiles` accepts `copyKeyFrom`. There is no new endpoint.
- Database: none. Profile parameters are already JSON.
- Docs: PRD §11.2 and §11.3 (new version; this reverses JOS-218's "no generic adapter" non-goal), `docs/api-spec.yml`, `docs/backend-standards.md`, the backend README.
- Cost: every RunningHub clip gets cheaper. 768P is $0.077 per second, against $0.12 for 2K. The Administrator should update RunningHub's price per clip second on `/admin`, or the cost report keeps using the 2K price. The live proof spends a few clips on Runway, at 720p to keep it cheap: Wan 3.0 $0.10 per second, Kling 4.0 $0.157 per second. It also spends a few on RunningHub.
