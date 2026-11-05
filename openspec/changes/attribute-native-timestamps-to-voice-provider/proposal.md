Linear-Issue: JOS-264

## Why

When the voice provider returns its own timestamps, no alignment request is sent, and the timestamps attempt is recorded with the fixed provider `elevenlabs-native`, whichever voice provider made the narration. A stubbed run, or any future non-ElevenLabs voice adapter, is reported as ElevenLabs on the session page and in telemetry. A fully stubbed run (E14, JOS-243) can't assert "every stage is a stub" until this is fixed. JOS-264, epic JOS-261 (E18).

## What Changes

- A native timestamps attempt records `<voice provider id>:native`, where the voice provider id is the one bound to the session (`runs.voice_provider_id`, else the active voice provider, as the voice-over phase does). Examples: `ElevenLabs:native`, `stub-voice:native`, `<ULID>:native`.
- A new small module, `backend/src/nativeTimestampsProvider.ts`, builds and recognises these ids. The legacy `elevenlabs-native` is still recognised, so stored attempts keep their meaning.
- The session page shows a native attempt as its voice provider's name with model `native timestamps`: `ElevenLabs` for the seeded profile, `Stub provider` for the stub. Legacy `elevenlabs-native` still shows ElevenLabs.
- Telemetry reports the voice provider's vendor: `ElevenLabs` for the seeded profile, `stub` for the stub.
- Every reader that skipped `elevenlabs-native` also skips the new ids: the failures report, the provider usage report, and a manual retry's new cycle, which keeps a native attempt's provider instead of the bound alignment provider.
- No API, schema or frontend change. The id is a stored string; no migration.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `app-telemetry`: native timestamps report the vendor of the voice provider that produced them, not always `ElevenLabs`.
- `stage-diagnostics`: adds a requirement that native timestamps name the voice provider that produced them.

## Impact

- Backend: `narrationTimestampsPhase.ts`, `stageDiagnostics.ts`, `db.ts` (`telemetryProviderOf`), `failuresReport.ts`, `providerUsageReport.ts`, `retry/stageAttemptRecorder.ts`, plus the new `nativeTimestampsProvider.ts`.
- Tests that pin `elevenlabs-native` as the recorded id change to the derived id; tests that read legacy rows keep it.
- APIs, data model, frontend: none. `GET /sessions/:id` keeps its shape; only the provider it names changes for non-ElevenLabs voice providers.
