## Context

`obtainNarrationTimestamps` (`narrationTimestampsPhase.ts:144`) records a timestamps attempt with `NATIVE_PROVIDER = "elevenlabs-native"` when the voice-over came with usable native timestamps, and with the bound alignment provider otherwise. The literal is read in six places:

| Reader | What it does with `elevenlabs-native` |
|---|---|
| `stageDiagnostics.ts` `DISPLAY.timestamps` and `describeProfile` | shows ElevenLabs, model `native timestamps`; skips the profile lookup |
| `db.ts` `telemetryProviderOf` | reports `ElevenLabs` |
| `failuresReport.ts` `sessionAttempts` | leaves it out: native timestamps call no provider |
| `providerUsageReport.ts` | leaves it out of every alignment row |
| `retry/stageAttemptRecorder.ts` `startNewCycle` | keeps it as the new cycle's provider instead of the bound alignment provider |
| `db.ts` migration (alignment backfill) | ran once, on rows that could only hold the literal; not touched |

Voice provider ids are the seeded profile id `ElevenLabs`, ULIDs for profiles added on `/admin`, and `stub-voice` for the stub (`bootstrap.ts`, `USE_STUB_VOICE_PROVIDER`). None contains `:`.

## Goals / Non-Goals

**Goals:**
- A native attempt names the voice provider bound to the session (AC1).
- The stub shows `Stub provider` and reports `stub`; ElevenLabs shows as today (AC2, AC3).
- Stored `elevenlabs-native` attempts keep showing ElevenLabs (AC4).

**Non-Goals:**
- Rewriting stored rows. Legacy ids stay as they are and stay readable.
- Changing when native timestamps are used, or the alignment binding rules of JOS-171: the native path still binds no alignment provider.

## Decisions

### 1. The id is `<voice provider id>:native`

- The voice provider id is `run.voiceProviderId ?? activeProviderId("voice")`, the same expression the voice-over phase uses (`voiceOverPhase.ts:207`).
- A suffix keeps the voice id readable, so display and telemetry can resolve it the way they already resolve a voice-over attempt's id. A stub id still starts with `stub-`, so every existing stub rule holds without a change.
- `:` cannot occur in a voice provider id (Context), so the suffix is unambiguous and SQL can match it with `LIKE '%:native'`.
- Alternative rejected: recording the bare voice id. Readers could no longer tell a native attempt from an alignment attempt, and the reports would count it as an alignment call.

### 2. One module owns the format

`backend/src/nativeTimestampsProvider.ts` exports `nativeTimestampsProviderId(voiceId)`, `isNativeTimestampsProviderId(id)` (true for `…:native` and legacy `elevenlabs-native`), `voiceProviderIdOfNative(id)` (`ElevenLabs` for the legacy id) and the SQL condition the two reports share. It imports nothing, so `db.ts` and the retry recorder can use it without an import cycle.

### 3. Display and telemetry resolve the voice id

- **Display:** for a native timestamps id, `describeProvider` describes the voice id as a `voice-over` provider and replaces the model with `native timestamps`. The legacy entry stays in `DISPLAY.timestamps`.
- **Telemetry:** `telemetryProviderOf` maps a native id to the voice id first, then applies its usual rules.

### 4. Readers that skipped the literal skip every native id

The failures report, the usage report and `startNewCycle` use the shared helper or SQL condition instead of comparing with the literal.

## Risks / Trade-offs

- [A future voice id containing `:native`] → ids are seeded names, ULIDs or `stub-…`; the helper's unit test pins the format.
- [An unknown voice id] → shown as an unknown provider and logged once, as any unknown id is today.
