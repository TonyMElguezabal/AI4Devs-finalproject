## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create branch `feature/jos-264-native-timestamps-provider` from `origin/feature/entrega-3-JAME` (`34ef3cc9`) with `--no-track`
- [x] 0.2 Verify the branch was created and is the current branch

## 1. Backend: The native id format (TDD; design Decisions 1-2)

- [x] 1.1 Write failing tests for `nativeTimestampsProviderId`, `isNativeTimestampsProviderId` and `voiceProviderIdOfNative`, legacy `elevenlabs-native` included
- [x] 1.2 Create `backend/src/nativeTimestampsProvider.ts` with no imports, and make them pass

## 2. Backend: Record the voice provider (TDD; AC1)

- [x] 2.1 Write failing tests in `obtain-narration-timestamps.test.ts`: a session bound to `stub-voice` records `stub-voice:native`; one bound to `ElevenLabs` records `ElevenLabs:native`; neither binds an alignment provider
- [x] 2.2 Replace `NATIVE_PROVIDER` in `narrationTimestampsPhase.ts` with the bound voice id (`run.voiceProviderId ?? activeProviderId("voice")`)

## 3. Backend: Display, telemetry, reports and retries (TDD; AC2-AC4; design Decisions 3-4)

- [x] 3.1 Write failing tests: `describeProvider("timestamps", "stub-voice:native")` is `Stub provider` / `native timestamps`, `"ElevenLabs:native"` is ElevenLabs / `native timestamps`, legacy unchanged; telemetry reports `stub` and `ElevenLabs`; both reports leave `…:native` attempts out; `startNewCycle` keeps a `…:native` provider
- [x] 3.2 Update `stageDiagnostics.ts`, `telemetryProviderOf` in `db.ts`, `failuresReport.ts`, `providerUsageReport.ts` and `retry/stageAttemptRecorder.ts` to use the helpers

## 4. Backend: Review and Update Existing Unit Tests (MANDATORY)

- [x] 4.1 Update tests that pin `elevenlabs-native` as the newly recorded id; keep the ones that read stored legacy rows (AC4)

## 5. Backend: Run Unit Tests and Verify Database State (MANDATORY)

- [x] 5.1 Capture the pre-test baseline of `backend/data/`
- [x] 5.2 Run the targeted tests and the full backend suite with a scratch `DB_PATH`, `PROJECTS_ROOT` and an empty `SECRETS_PATH`, plus `npm run typecheck` and `npm run lint`
- [x] 5.3 Verify the post-test state of `backend/data/` matches 5.1, and restore it if it does not
- [x] 5.4 Create report `openspec/changes/attribute-native-timestamps-to-voice-provider/reports/YYYY-MM-DD-step-5-unit-test-and-db-verification.md`

## 6. Backend: Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 6.1 Start the backend on a scratch store with literal env vars and `USE_STUB_VOICE_PROVIDER=success`; create a session, generate its voice-over, and read `GET /sessions/:id`: the timestamps stage shows `Stub provider` / `native timestamps`, and the stored attempt is `stub-voice:native`
- [x] 6.2 Insert a legacy `elevenlabs-native` attempt in the scratch store and confirm it still reads as ElevenLabs
- [x] 6.3 Record both in `reports/YYYY-MM-DD-step-6-manual-endpoint-testing.md`

## 7. Frontend: E2E Testing with Playwright MCP (MANDATORY if applicable - AGENT MUST EXECUTE)

- [ ] 7.1 Open the stubbed session from 6.1 in the browser and confirm the diagnostics show `Stub provider` for timestamps; record it in `reports/YYYY-MM-DD-step-7-e2e-testing.md`

## 8. Update Technical Documentation (MANDATORY)

- [ ] 8.1 Update `docs/backend-standards.md` where it describes the timestamps attempt's provider, and `docs/data-model.md` if it lists `elevenlabs-native`
- [ ] 8.2 Confirm `docs/api-spec.yml` needs no change
- [ ] 8.3 Run `graphify update .`

## 9. Delivery

- [ ] 9.1 Commit on the feature branch
- [ ] 9.2 Ask before pushing. Open a PR into `feature/entrega-3-JAME` that explains the cause and the fix
