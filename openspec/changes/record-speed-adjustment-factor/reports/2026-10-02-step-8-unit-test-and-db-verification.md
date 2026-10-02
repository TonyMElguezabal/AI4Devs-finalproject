# Step 8 Report - Unit Tests and Database Verification

- Date: 2026-10-02
- Change: record-speed-adjustment-factor (JOS-148)
- Agent: Claude Sonnet 5

## Commands Executed

- `npx vitest run test/admitted-durations.test.ts test/scene-registration-persistence.test.ts test/scene-registration.test.ts test/scene-api-surface.test.ts test/providerConfig.test.ts` (backend, targeted)
- `npm run typecheck` (backend)
- `npx vitest run` (backend, full suite)
- `npx tsc --noEmit` (frontend)
- `npx vitest run` (frontend, full suite)
- `npx vitest run --coverage.enabled --coverage.provider=v8` (backend, HEAD, for the coverage comparison)
- Coverage baseline comparison: `git worktree add <scratchpad>/jos148-base a3f5801` (this change's propose commit, before any implementation), `ln -s ../../backend/node_modules node_modules`, `npx vitest run --coverage.enabled --coverage.provider=v8`, then `git worktree remove --force`

## Unit Test Results

- Targeted tests: 151 passed, 0 failed, 0 skipped
- Backend full suite: 709 passed, 0 failed, 2 skipped (pre-existing, unrelated: `alignment-provider.contract.test.ts`, `visual-instructions.contract.test.ts`)
- Frontend full suite: 42 passed, 0 failed, 0 skipped
- Runtime: backend ~10s, frontend ~1.4s
- Notes: under `--coverage.enabled`, real-timer `waitFor` tests in `orchestrator.test.ts` and `narration-interval-immutability.test.ts` flaked once each (coverage instrumentation slows them past their timeout) and passed cleanly in isolation and on a plain (non-coverage) full-suite rerun. This is the same pre-existing flakiness class JOS-147's own step-7 report recorded ("retry-budget real-timer test... treated as a pre-existing timing flake, not a regression"), not something this change introduced — confirmed by the plain `npx vitest run` rerun reported above passing 709/709 with no coverage flag.

## Coverage Comparison (task 7.4)

| Metric | Base (`a3f5801`) | HEAD | Δ |
|---|---|---|---|
| Statements | 95.72% | 95.78% | +0.06 |
| Branch | 91.72% | 91.91% | +0.19 |
| Functions | 98.91% | 98.91% | 0 |
| Lines | 95.72% | 95.78% | +0.06 |

No file regressed. Touched files: `admittedDurations.ts` stayed 100/100/100/100; `sceneRegistration.ts` 98.27→98.34% stmts, 96.96→97.05% branch; `db.ts` 98.19→98.25% stmts, 91.72→91.91% branch; `providerConfig.test.ts`'s target `config/providers.ts` stayed 100/100/100/100.

## Scenario-to-test mapping (task 7.3)

All 14 scenarios across `specs/clip-duration-request/spec.md`'s 5 new requirements:

| Requirement | Scenario | Test |
|---|---|---|
| The speed-adjustment factor is derived... | A slow-down | `scene-registration.test.ts` "stores the factor with no warning for an ordinary chunk" (9.5s→10s) |
| | A speed-up | `admitted-durations.test.ts` "picks a shorter admitted duration when it is closer" (9.4s→9s) |
| | The factor is always at least 1 | `admitted-durations.test.ts` "never returns a factor below 1 (JOS-148)" |
| The speed-adjustment factor is stored... | Stored and read back | `scene-registration-persistence.test.ts` "reads each registered chunk back with the speed factor and warning..." |
| | Direct update refused | `scene-registration-persistence.test.ts` "refuses a change of %s, naming the field..." |
| | A different acceptable limit later | Covered by construction (same lock trigger as above) + design.md task 4.1's reasoning: the factor is derived from already-locked inputs in the same transaction, so it inherits their immutability guarantee |
| A factor exceeding the acceptable limit... | The factor exceeds the limit | `scene-registration.test.ts` "records exceeds-limit, without failing the chunk or the session..." |
| | The factor is within the limit | `scene-registration.test.ts` "stores the factor with no warning for an ordinary chunk" / "...under the limit... (17.4s→15s)" |
| | Both warnings on the same chunk | `scene-registration.test.ts` "carries both duration_warning and speed_factor_warning independently..." |
| The speed-adjustment factor is readable | Exposed on the session read | `scene-api-surface.test.ts` "is carried by every scene of the session read" / "...by the snapshot entries..." |
| | Skeleton scene | `scene-api-surface.test.ts` "is omitted for a scene created without a decomposition"; `scene-registration.test.ts` "gives a scene created without a decomposition no speed factor and no warning" |
| The scene-details panel shows... | A scene's details are opened | `components.test.tsx` "shows the requested duration and speed factor when present" |
| | A warning is shown alongside the value it qualifies | `components.test.tsx` "shows the speed-factor warning distinguishably from a duration warning" |
| | A skeleton scene's details omit the fields | `components.test.tsx` "shows neither the requested duration nor the speed factor for a skeleton scene" |

## Database State Verification

- Pre-test baseline (`backend/data/skeleton.sqlite`, the default store used by `vitest run` with no `DB_PATH` override):
  - `runs`/`scenes`/`voice_overs`/`stage_attempts`/`narration_timestamps`: 0 rows each
  - `schema_migrations`: versions 2-11 applied
  - Triggers: 17
  - `data/projects/`: found and removed one stray empty folder (`Traversal Test 2026-10-02 09-43`) left over from an earlier manual run this session — same category as `generate-chunk-image`'s and `request-admitted-clip-duration`'s own precedent
- Post-test validation (after the full backend + frontend suites above):
  - Same five tables: 0 rows each (unchanged)
  - `schema_migrations`: versions 2-11 (unchanged)
  - Triggers: 17 (unchanged)
  - `data/projects/`: one new stray empty folder (`Traversal Test 2026-10-02 09-45`) appeared from this run's own traversal-isolation test, same as the pre-existing baseline's pattern
- State restored: Yes
- Restoration actions: removed the post-test stray empty project folder (`rmdir`); no row, migration or trigger mismatch required any restoration

## Outcome

- Step 8 status: PASS
- Blocking issues: none
