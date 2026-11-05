# Step 5 Report: Unit Tests and Database Verification

- Date: 2026-11-04
- Change: key-per-adapter-tables
- Agent: Claude Code (Opus 5.5)

## Step 4: Review of the existing tests (4.1)

| File | Decision |
|---|---|
| `provider-types.test.ts` | Unchanged. Its catalogue tests check the form fields, which the new test does not. |
| `provider-connection-check.test.ts` | `Case.type` is now `AdapterTypeId`, so the table can be indexed without `!`. The assertion that `CONNECTION_CHECKS` matches the catalogue is removed, because `adapter-type-tables.test.ts` matches it to `PARAMETER_SHAPES`. The assertion that every adapter type has a test case stays, under the name "has a test case for every adapter type in the catalogue". |
| `admin-provider-connection-test-route.test.ts` | The catalogue row's `id` is typed `AdapterTypeId`, and the `!` that lint now flags as unnecessary are removed. Every assertion is unchanged. |
| `telemetry-provider-name.test.ts` | The keys-vs-`PARAMETER_SHAPES` assertion is removed, because the new test covers it. The exact vendor names are still asserted. |

## Commands Executed

All runs used literal scratch paths under the session scratchpad, so `backend/data/` and the local `.secrets.json` were never used:

- `DB_PATH=<scratch>/vt/db.sqlite PROJECTS_ROOT=<scratch>/vt/projects npx vitest run test/adapter-type-tables.test.ts test/provider-types.test.ts test/provider-connection-check.test.ts test/admin-provider-connection-test-route.test.ts test/telemetry-provider-name.test.ts`
- `DB_PATH=<scratch>/full/db.sqlite PROJECTS_ROOT=<scratch>/full/projects SECRETS_PATH=<scratch>/full/secrets.json npx vitest run` (with `secrets.json` set to `{}`)
- `npm run typecheck`
- `npm run lint`

## Unit Test Results

- **Red state (1.2):** before section 2, `npm run typecheck` failed on the missing `AdapterTypeId` export (TS2724), the vendor type assertion (TS2554) and the unused `@ts-expect-error` (TS2578).
- **Targeted tests:** 5 files, 85 tests passed, 0 failed.
- **Full suite:** 210 files passed and 6 skipped; 2693 tests passed, 12 skipped, 0 failed. Runtime 142 s.
  - The skipped files are the real-provider contract tests and `subtitles-real-ffmpeg`, which run only with real keys or the pinned ffmpeg. None of them were touched.
- **Typecheck and lint:** both pass.
- **Coverage:** the backend has no coverage provider installed, so coverage was not measured.
  - No source line lost a test: the two removed assertions are covered by `adapter-type-tables.test.ts`.
  - The changed source (`providerTypes.ts`, `providerConnectionCheck.ts`, `adminProviderRoutes.ts`) runs in the targeted tests above.

## Database State Verification

- **Pre-test baseline (`backend/data/`):**
  - `skeleton.sqlite`: `provider_profiles` = 5 rows, sha256 of the ordered rows `82f3ef424f3ac688…`; `runs` = 1.
  - `store.sqlite`: sha256 `e3b0c44298fc1c14…` (empty file).
  - `projects/`: 1 entry.
- **Post-test validation:** the same values for every check.
- **State restored:** not needed. Nothing changed.

## Outcome

- Step 5 status: PASS
- Blocking issues: none
