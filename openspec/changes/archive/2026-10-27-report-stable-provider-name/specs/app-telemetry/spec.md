## ADDED Requirements

### Requirement: The provider label is a fixed vendor name

Every provider-usage metric and error record SHALL set `provider` to one value from a fixed set defined in the code, and SHALL NOT send the identifier stored for the attempt or the scene. The value SHALL be the vendor of the adapter type of the provider profile the identifier names (`OpenAI`, `ElevenLabs`, `Fal.ai` or `RunningHub`), after resolving the legacy image and clip identifiers to their seeded profiles. ElevenLabs' native timestamps SHALL report `ElevenLabs`. The assembly stage, which calls no provider, SHALL report `local`. A stub provider SHALL report `stub`. Any other identifier, a missing one included, SHALL report `unknown`. A profile's admin-editable label SHALL NOT be sent (JOS-213).

#### Scenario: Each stage reports its vendor

- **WHEN** `providerUsage` is on and a decomposition, voice-over, timestamps, image and clip call each complete with their seeded providers
- **THEN** the attempt counter carries `OpenAI`, `ElevenLabs`, `ElevenLabs`, `Fal.ai` and `RunningHub` respectively

#### Scenario: One vendor across two stages

- **WHEN** a voice-over attempt and a native timestamps attempt complete
- **THEN** both carry `provider` `ElevenLabs` and differ only by `stage`

#### Scenario: Legacy identifiers resolve to their vendor

- **WHEN** an image request is recorded for a scene that stored `fal-ai/flux/dev`, and a clip request for a scene that stored `/openapi/v2/minimax/hailuo-h3/image-to-video`
- **THEN** they carry `Fal.ai` and `RunningHub`, and no exported attribute contains the model name or the endpoint path

#### Scenario: A provider added on /admin reports its vendor, not its id or label

- **WHEN** an attempt completes with a profile added on `/admin` of adapter type `fal-image`, whose id is a ULID and whose label is `My image account`
- **THEN** it carries `Fal.ai`, and neither the ULID nor the label is exported

#### Scenario: Assembly reports local

- **WHEN** an assembly attempt completes with no provider identifier
- **THEN** it carries `provider` `local`

#### Scenario: An unmapped identifier reports unknown

- **WHEN** an attempt completes with an identifier that names no profile and has no fixed entry
- **THEN** it carries `provider` `unknown` and the identifier is not exported

#### Scenario: Error records use the same value

- **WHEN** `errors` is on and a clip request is recorded as `not_retryable_failure`
- **THEN** the error record's `provider` is `RunningHub`
