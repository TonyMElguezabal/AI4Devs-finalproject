# active-provider-selection Specification

## Purpose
TBD - created by archiving change change-active-provider-from-admin. Update Purpose after archive.
## Requirements
### Requirement: The active provider is the /admin choice, else the settings files

For each stage (reasoning, voice, alignment, image, video), the active provider SHALL be the provider the Administrator last chose for that stage on `/admin`. If no choice has been made, it SHALL be the provider set for that stage in the settings files. A choice made on `/admin` SHALL survive an application restart.

#### Scenario: No /admin choice

- **GIVEN** no active-provider choice has been made for the image stage
- **WHEN** the active image provider is read
- **THEN** it is the image provider set in the settings files

#### Scenario: An /admin choice survives a restart

- **GIVEN** the Administrator chose `stub-b` as the active video provider
- **WHEN** the app restarts
- **THEN** the active video provider is still `stub-b`

### Requirement: Only a shipped adapter can be chosen

The Administrator SHALL only be able to choose, for a stage, a provider that is a usable, non-retired provider profile of that stage, that is, a profile of an adapter type the application ships for that stage whose parameters are valid and whose API key can be resolved (provider-profiles). A request naming any other provider SHALL be refused and SHALL leave the active provider unchanged: an unknown or retired provider with a validation error naming the stage's selectable providers, and a profile that is not usable with a response that says why.

#### Scenario: Unknown provider

- **WHEN** the Administrator submits `"acme"` as the active voice provider
- **THEN** the request is refused with a validation error naming the voice stage's selectable providers
- **AND** the active voice provider is unchanged

#### Scenario: A profile that is not usable

- **GIVEN** an image profile with no resolvable API key
- **WHEN** the Administrator submits it as the active image provider
- **THEN** the request is refused with a reason saying the key is missing
- **AND** the active image provider is unchanged

### Requirement: Only the Administrator can change the active provider

Changing the active provider SHALL require Administrator access to `/admin` (JOS-173). Without it, the change SHALL be refused and nothing SHALL be stored.

#### Scenario: Change without Administrator access

- **GIVEN** a person who has not entered the Administrator password
- **WHEN** they request a change of the active video provider
- **THEN** the request is refused as unauthorized
- **AND** the active video provider is unchanged

### Requirement: A change applies to the next unbound stage without a restart

A change of the active provider SHALL apply, without restarting the application, to every stage instance that binds after the change. It SHALL NOT apply to stage instances already bound.

#### Scenario: A new scene after the change

- **GIVEN** the active image provider is `stub-a`
- **WHEN** the Administrator changes it to `stub-b` and a scene's image stage then makes its first attempt
- **THEN** that scene's image stage is bound to `stub-b` and its request is sent to `stub-b`

### Requirement: Every stage binds to a provider on its first attempt

Each stage instance SHALL be bound, once and atomically, to the provider that is active at its first attempt. Reasoning, voice and alignment SHALL be bound per session. Image and video SHALL be bound per scene. Once set, a binding SHALL never be overwritten.

#### Scenario: Reasoning is bound per session

- **WHEN** a session's first decomposition attempt is made while `stub-a` is the active reasoning provider
- **THEN** the session's reasoning binding is `stub-a`

#### Scenario: Two first attempts race

- **WHEN** two first attempts of the same stage instance try to bind at the same time, after the active provider changed between them
- **THEN** exactly one binding is stored and both attempts use it

### Requirement: Bound stages keep their provider for every retry

A stage instance that is already bound SHALL use its bound provider for all of its automatic and manual retries, whatever the active provider is now.

#### Scenario: Automatic retry after the change

- **GIVEN** a session whose voice stage is bound to `stub-a` and whose attempt failed transiently
- **WHEN** the active voice provider changes to `stub-b` and the automatic retry is sent
- **THEN** the retry is sent to `stub-a`

#### Scenario: Manual retry after the change

- **GIVEN** a scene whose video stage is bound to `stub-a` and is `failed` with its retries exhausted
- **WHEN** the active video provider changes to `stub-b` and the User retries the clip
- **THEN** the new cycle is sent to `stub-a`

### Requirement: Completed results are not regenerated

Changing the active provider SHALL NOT regenerate, invalidate or re-request any completed result: voice-over, narration timestamps, chunks, images or clips.

#### Scenario: Completed images after the change

- **GIVEN** a session with three completed images from `stub-a`
- **WHEN** the active image provider changes to `stub-b`
- **THEN** no image request is sent for those three scenes and their images are unchanged

### Requirement: No automatic provider switch

When a stage instance's retries are exhausted, the system SHALL NOT bind it to, or send it to, any other provider. The stage instance SHALL stay bound to its original provider.

#### Scenario: Retries exhausted

- **GIVEN** a scene whose image stage is bound to `stub-a` while `stub-b` is active
- **WHEN** the fourth attempt of its cycle fails
- **THEN** the scene's image stage is `failed` and still bound to `stub-a`
- **AND** no request is sent to `stub-b`

### Requirement: The Administrator sees the active provider and its source

`/admin` SHALL show, for each stage, the active provider, whether it comes from the settings files or from an `/admin` choice, and the providers that can be selected.

#### Scenario: Viewing active providers

- **GIVEN** the Administrator chose `stub-b` for video and made no other choice
- **WHEN** they open the active-providers section of `/admin`
- **THEN** video shows `stub-b` from `/admin`, and every other stage shows its settings-file provider from the settings files

