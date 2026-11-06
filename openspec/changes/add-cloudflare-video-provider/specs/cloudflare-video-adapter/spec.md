## ADDED Requirements

### Requirement: A Cloudflare video profile names an account and a model

The application SHALL ship a video adapter type `cloudflare-video`, whose vendor is Cloudflare. Its parameters SHALL be the Cloudflare account id (32 lowercase hexadecimal characters), the model identifier (default `minimax/h3`) and the admitted shortest and longest clip in whole seconds. Its key SHALL be a Cloudflare API token, stored like every other provider key. No parameter SHALL name a host: every request SHALL go to `api.cloudflare.com`.

#### Scenario: Add a Cloudflare profile

- **WHEN** the Administrator saves a video profile of type `cloudflare-video` with an account id, the model `minimax/h3`, durations 5 to 15 and a token
- **THEN** the profile is stored, its token is stored encrypted and shown only by its last four characters
- **AND** the profile can be made the active video provider

#### Scenario: An account id that is not one

- **WHEN** the Administrator saves a Cloudflare profile whose account id is `https://evil.example` or is not 32 hexadecimal characters
- **THEN** the save is refused with a problem on `accountId`, and nothing is stored

### Requirement: The clip is requested with the scene image as its first frame

The adapter SHALL request a clip with one JSON `POST` to `https://api.cloudflare.com/client/v4/accounts/{accountId}/ai/run`, authenticated with `Authorization: Bearer <token>`, with body `{ model, input }`, where `input.content` holds the `VIDEO` instruction as a `text` item and the scene image as an `image_url` item with role `first_frame`, `input.duration` is the requested duration and `input.resolution` is `2K`. The image SHALL be sent in the form the verification spike confirms Cloudflare accepts for a local file. The request body recorded for the clip request status SHALL name the first frame as the scene's image and SHALL NOT contain the image data or the token.

#### Scenario: A clip is submitted

- **GIVEN** an active Cloudflare profile and a scene with its image and a requested duration of 6 seconds
- **WHEN** its clip is submitted
- **THEN** one request goes to the account's `ai/run` URL with the profile's model, the instruction, the image as first frame, duration 6 and resolution `2K`
- **AND** the submit result carries the task id Cloudflare answered

#### Scenario: The recorded body hides the image and the token

- **WHEN** a Cloudflare clip has been submitted
- **THEN** the recorded request body holds the prompt, the duration and the resolution, and names the first frame as the scene's image
- **AND** it holds neither the image data nor the token

### Requirement: A Cloudflare clip is followed until it ends

The adapter SHALL follow a submitted clip by its task id in the way the verification spike confirms, so a clip still in progress when the application restarts is followed after the restart and not requested again. A task that is `queued` or `running` SHALL be pending. A task that is `succeeded` with `content.url` SHALL be a success whose clip is a temporary link, downloaded before the chunk completes. A task that is `succeeded` without a URL, or `failed`, or `cancelled`, SHALL be a transient failure whose reason names the task and carries Cloudflare's error code when there is one. A task id Cloudflare no longer knows SHALL be reported as not found.

#### Scenario: The clip is ready

- **GIVEN** Cloudflare answers the task as `succeeded` with `content.url`
- **WHEN** the clip is polled
- **THEN** the result is a success with that URL as a temporary link

#### Scenario: The clip is still being made

- **GIVEN** Cloudflare answers the task as `queued` or `running`
- **WHEN** the clip is polled
- **THEN** the result is pending

#### Scenario: The task failed at Cloudflare

- **GIVEN** Cloudflare answers the task as `failed` with `error.code` and `error.message`
- **WHEN** the clip is polled
- **THEN** the result is a transient failure whose reason carries the error code and no credential

#### Scenario: A restart while a clip is being made

- **GIVEN** a Cloudflare clip submitted before the application stopped
- **WHEN** the application starts again
- **THEN** the clip is followed by its stored task id and no second clip is requested

### Requirement: Cloudflare's answers are classified like every other vendor's

The adapter SHALL pass the shared adapter contract: an HTTP 4xx answer other than 408 and 429 SHALL be not retryable, an HTTP 408, 429 or 5xx answer SHALL be transient, a refused connection or a timeout SHALL be transient and marked unresponsive, and a malformed body SHALL be a defined failure. An answer with `success: false` and an `errors` list SHALL be classified by its HTTP status, with a reason that carries Cloudflare's first error code and no credential.

#### Scenario: A token without the Workers AI permission

- **GIVEN** Cloudflare answers HTTP 401 with error code `10000`
- **WHEN** a clip is submitted
- **THEN** the submission fails as not retryable with a reason that carries `10000`

#### Scenario: Cloudflare is busy

- **GIVEN** Cloudflare answers HTTP 429
- **WHEN** a clip is submitted or polled
- **THEN** the result is a transient failure after exactly one request

### Requirement: The Cloudflare connection check verifies the token for free

The connection check of a Cloudflare profile SHALL send one free request to Cloudflare's token verification and SHALL show connected for an active token, key rejected for an unknown, expired or disabled token, vendor unreachable when Cloudflare does not answer, and unexpected answer with its HTTP status otherwise. It SHALL state that it checked only the token, not the account id, the model or the Workers AI permission.

#### Scenario: An active token

- **GIVEN** Cloudflare's token verification answers that the token is active
- **WHEN** the Administrator tests the Cloudflare profile
- **THEN** the result is connected, and the page says only the token was checked

#### Scenario: A rejected token

- **GIVEN** Cloudflare's token verification refuses the token
- **WHEN** the Administrator tests the Cloudflare profile
- **THEN** the result is key rejected
