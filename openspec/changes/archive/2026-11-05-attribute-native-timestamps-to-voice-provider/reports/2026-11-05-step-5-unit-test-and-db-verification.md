# Step 5 Report: Unit Tests and Database Verification

- Date: 2026-11-05
- Change: attribute-native-timestamps-to-voice-provider
- Agent: Claude Code (Opus 5.5)

## Red, then green (steps 1-4)

| Step | Red state | Green |
|---|---|---|
| 1. Id helpers | `native-timestamps-provider.test.ts` could not load `../src/nativeTimestampsProvider.ts` (module missing) | 3 passed |
| 2. Recorded id | 3 cases in `obtain-narration-timestamps.test.ts` failed: the attempt was `elevenlabs-native` | 34 passed |
| 3. Readers | 5 failed: display, telemetry, usage report, failures report (a native attempt appeared as an `alignment` stage), new cycle | all passed |

- **Test environment:** the active voice provider is `stub-voice`. The "active voice provider" case and the AC5 retry cases compare against `activeProviderId("voice")`, not a fixed id.
- **Telemetry test helper:** `attemptProvider` reads the first data point of a cumulative exporter, so a second call in the same test reads the first call's value. The ElevenLabs and stub cases are therefore two tests.
- **Proof the telemetry fix is needed:** with the `db.ts` change removed, the ElevenLabs case fails. The stub case passes either way, because `stub-voice:native` starts with `stub-`, as design Decision 1 intended.

## Existing tests reviewed (step 4)

| File | `elevenlabs-native` used as | Change |
|---|---|---|
| `obtain-narration-timestamps.test.ts` (3 cases) | the id the phase records | now the voice provider's id + `:native` |
| `active-provider-binding-guarantees.test.ts` | the id the phase records | now `${activeProviderId("voice")}:native` |
| `stage-diagnostics.test.ts`, `stage-diagnostics-surface.test.ts` | stored legacy rows read by the page | kept (AC4) |
| `telemetry-provider-name.test.ts`, `new-cycle-binding.test.ts` | stored legacy rows | kept (AC4); new cases added beside them |
| `failures-report.test.ts`, `provider-usage-report.test.ts` | seeded rows left out of the reports | kept; a `voice-a:native` row added beside each |
| `narration-timestamps-persistence.test.ts`, `active-provider-storage.test.ts` | a stored string round-trip and a migration | kept |

## Commands Executed

All runs used literal scratch paths, so `backend/data/` and the local `.secrets.json` were never used:

- `DB_PATH=<scratch>/full/db.sqlite PROJECTS_ROOT=<scratch>/full/projects SECRETS_PATH=<scratch>/full/secrets.json npx vitest run`, with `secrets.json` set to `{}`
- `npm run typecheck` and `npm run lint`

## Unit Test Results

- **Full suite:** 211 files passed and 6 skipped; 2702 passed, 12 skipped, 0 failed. Runtime 139 s.
  - 2702 = 2693 on the base branch + 9 new cases.
- **Typecheck and lint:** pass.
- **Coverage:** no coverage provider is installed. Every changed source line has a case: the new module (3), the phase (3), display (1), telemetry (2), both reports and the new cycle (1 each).

## Database State Verification

- **Pre-test (`backend/data/`):** `skeleton.sqlite` has 5 profiles and 1 run, profile rows sha256 `82f3ef424f3ac688…`; `store.sqlite` sha256 `e3b0c44298fc1c14…`; `projects/` has 1 entry.
- **Post-test:** identical.
- **State restored:** not needed.

## Outcome

- Steps 1-5 status: PASS
- Blocking issues: none
