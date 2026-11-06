# configured-video-connector Specification

## Purpose
A video provider the Administrator describes on /admin, so a new vendor or model needs no code: its requests, the key bound to its host, its connection check and its clips capped at 1080p (JOS-219).
## Requirements
### Requirement: A video provider can be described by a definition on /admin

The application SHALL ship a video adapter type `configured-video`. A profile of that type SHALL hold a base URL, a model, a resolution, the admitted shortest and longest clip, and a definition of its requests: the headers, an optional upload step, a submit step, a poll step and an optional check step. Adding a vendor or a model this way SHALL need no code change and no restart. Every problem in a definition SHALL be listed at save time with its path, for example `requests.poll.statusAt`.

#### Scenario: Add a vendor with no code

- **GIVEN** the Runway definition of `docs/video-connector-definitions.md` with model `wan3`
- **WHEN** the Administrator saves it as a video profile with a key and makes it active
- **THEN** the next clip that binds is requested from Runway with model `wan3`, with no restart

#### Scenario: A definition with problems

- **WHEN** the Administrator saves a definition whose poll step has no status path and whose submit body uses `{image_url}` without an upload step
- **THEN** the save is refused, both problems are listed with their paths, and nothing is stored

### Requirement: Templates send exactly what the definition names

The connector SHALL fill the definition's paths, headers and JSON bodies with the placeholders `{instruction}`, `{duration}`, `{model}`, `{resolution}`, `{image_data_uri}`, `{image_base64}`, `{image_url}`, `{task_id}` and `{key}`. A JSON string that is exactly one placeholder SHALL be replaced by the typed value. A placeholder inside a longer string SHALL be replaced as text, and URL-encoded in a path. The connector SHALL add no field the template does not name. An unknown placeholder, `{image_url}` without an upload step, or `{task_id}` outside the poll step SHALL be refused at save time.

#### Scenario: A typed duration

- **GIVEN** a submit body `{ "duration": "{duration}", "promptText": "{instruction}" }`
- **WHEN** a 6-second clip is submitted
- **THEN** the body sent is `{ "duration": 6, "promptText": "<the VIDEO instruction>" }` and has no other field

#### Scenario: The image as a data URI

- **GIVEN** a submit body with `"promptImage": "{image_data_uri}"`
- **WHEN** a clip is submitted
- **THEN** `promptImage` is `data:image/png;base64,` followed by the scene image

#### Scenario: The data URI and the upload name the image's real type

- **GIVEN** a scene image that is a JPEG (the image provider's usual output)
- **WHEN** a clip is submitted
- **THEN** `{image_data_uri}` starts with `data:image/jpeg;base64,` and an upload step sends the file as `image/jpeg` named `frame.jpg`
- **AND** the type is read from the image's first bytes with the sniffer the image stage already uses (PNG or JPEG); any other image is sent as PNG, as before

### Requirement: The connector follows the submit and poll pattern

The connector SHALL run the upload step (when defined) and the submit step as one attempt, and SHALL take the request id from the submit answer at `taskIdAt`. When polling, a status in `doneWhen` with a URL at `videoUrlAt` SHALL be a success with that URL as a temporary link. A status in `doneWhen` without a URL, or a status in `failedWhen`, SHALL be a transient failure. The poll step's not-found status SHALL be not found. Any other status SHALL be pending. A clip in progress at a restart SHALL be followed by its stored request id and not requested again.

#### Scenario: Upload then submit

- **GIVEN** the RunningHub definition with an upload step whose URL is at `data.download_url`
- **WHEN** a clip is submitted
- **THEN** the image is uploaded as multipart part `file`, and the submit body's `firstFrameUrl` is the uploaded URL

#### Scenario: The clip is ready

- **GIVEN** a poll answer whose value at `statusAt` is in `doneWhen` and whose value at `videoUrlAt` is a URL
- **WHEN** the clip is polled
- **THEN** the result is a success with that URL as a temporary link

#### Scenario: A queued task

- **GIVEN** a poll answer whose status is `THROTTLED`, which is neither in `doneWhen` nor in `failedWhen`
- **WHEN** the clip is polled
- **THEN** the result is pending

#### Scenario: A restart while a clip is being made

- **GIVEN** a connector clip submitted before the application stopped
- **WHEN** the application starts again
- **THEN** the clip is polled by its stored request id and no second clip is requested

### Requirement: Answers are classified by the shared rule and the vendor's error field

The connector SHALL pass the shared adapter contract for every example definition. A 4xx answer other than 408 and 429 SHALL be not retryable. A 408, a 429 or a 5xx SHALL be transient. A failed request SHALL be transient and marked unresponsive. An answer that cannot be parsed, or lacks the value at a path the step reads, SHALL be a transient failure naming the step and the path. A 2xx answer whose value at `errorAt` is present and not in `okErrorValues` SHALL be a transient failure whose reason carries the vendor's code and no credential.

#### Scenario: An error inside a 200 answer

- **GIVEN** the RunningHub definition and an upload answer of HTTP 200 with `errorCode` `1000`
- **WHEN** a clip is submitted
- **THEN** the submission fails as transient, with a reason that names the upload step and carries `1000`

#### Scenario: A refused request

- **GIVEN** a submit answered with HTTP 400
- **WHEN** a clip is submitted
- **THEN** the submission fails as not retryable after exactly one request

### Requirement: The key reaches only the host it was entered for

A connector profile's base URL SHALL be `https://` followed by a host and an optional port, with no path, query, user info or fragment. Each step SHALL name a path, never a URL. `{key}` SHALL be allowed only in header values. Saving a profile with a base URL host different from its stored one SHALL clear its stored key and say so in the response. A clip request status and every log SHALL hold neither the key nor the image data.

#### Scenario: Changing the host clears the key

- **GIVEN** a connector profile for `api.dev.runwayml.com` with a stored key
- **WHEN** the Administrator saves it with base URL `https://other.example`
- **THEN** the stored key is cleared, the response says so, and the profile is not usable until a key is entered

#### Scenario: The key outside a header

- **WHEN** the Administrator saves a definition with `{key}` in a submit body or a path
- **THEN** the save is refused with a problem on that path

### Requirement: A profile can be duplicated for another model

The Administrator SHALL be able to duplicate a profile on `/admin`. The add form is filled with the definition, durations and resolution of the source profile. A new connector profile SHALL be able to reuse the stored key of another connector profile with the same base URL host, by naming it in `copyKeyFrom`. The key SHALL never be sent to the page. `copyKeyFrom` naming a profile of another type or another host SHALL be refused.

#### Scenario: Kling next to Wan

- **GIVEN** a Runway connector profile for `wan3` with a stored key
- **WHEN** the Administrator duplicates it, sets the model to `kling_4`, and saves with `copyKeyFrom` set to the Wan profile
- **THEN** a second profile is stored with the same definition and its own copy of the key

#### Scenario: Copying a key to another host

- **WHEN** the Administrator saves a connector profile for `https://other.example` with `copyKeyFrom` naming the Runway profile
- **THEN** the save is refused with a problem on `copyKeyFrom`, and no key is copied

### Requirement: Telemetry and diagnostics name a connector by its host and model

The telemetry vendor of a configured connector profile SHALL be its base URL host. Its label SHALL never be sent. A scene's details SHALL name a connector clip's provider by the profile's label and its model.

#### Scenario: A Runway clip in telemetry and diagnostics

- **GIVEN** a clip made through a Runway connector profile labelled "Runway Kling" with model `kling_4`
- **WHEN** its usage is reported and its scene details are opened
- **THEN** the telemetry vendor is `api.dev.runwayml.com`, and the scene details show "Runway Kling" and `kling_4`

