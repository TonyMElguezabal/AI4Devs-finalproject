## ADDED Requirements

### Requirement: Native timestamps name the voice provider that produced them

When the voice provider's native timestamps are used, the timestamps attempt SHALL be recorded with the voice provider bound to the session, marked as native, and never with a fixed vendor. The session page SHALL show that attempt with the voice provider's display name and model `native timestamps`. An attempt stored before this rule with `elevenlabs-native` SHALL still show `ElevenLabs` with model `native timestamps`. Native timestamps SHALL NOT bind an alignment provider to the session.

#### Scenario: Stub voice provider

- **GIVEN** a session whose voice-over was made by the stub voice provider with native timestamps
- **WHEN** `GET /sessions/:id` is read
- **THEN** the `timestamps` stage shows provider `Stub provider` with model `native timestamps`

#### Scenario: ElevenLabs voice profile

- **GIVEN** a session whose voice-over was made by the seeded ElevenLabs profile with native timestamps
- **WHEN** `GET /sessions/:id` is read
- **THEN** the `timestamps` stage shows provider `ElevenLabs` with model `native timestamps`

#### Scenario: Attempt stored before the change

- **GIVEN** a session whose timestamps attempt was stored with `elevenlabs-native`
- **WHEN** it is read
- **THEN** the `timestamps` stage shows provider `ElevenLabs` with model `native timestamps`
