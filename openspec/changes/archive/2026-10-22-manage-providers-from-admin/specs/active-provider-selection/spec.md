## MODIFIED Requirements

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
