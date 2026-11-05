## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create branch `feature/jos-262-key-per-adapter-tables` from `origin/feature/entrega-3-JAME` (`850df960`) with `--no-track`
- [x] 0.2 Verify the branch was created and is the current branch

## 1. Backend: Adapter-type table tests (TDD; design Decision 4)

- [x] 1.1 Write `backend/test/adapter-type-tables.test.ts`. Use `expectTypeOf` to assert that `CONNECTION_CHECKS` is `Record<AdapterTypeId, ConnectionCheck>`, that `ADAPTER_VENDORS` is `Record<AdapterTypeId, string>` and that `AdapterType["id"]` is `AdapterTypeId`. Add one `// @ts-expect-error` fixture typed `typeof CONNECTION_CHECKS` with one entry missing, and add runtime tests that the keys of `CONNECTION_CHECKS` and `ADAPTER_VENDORS`, and the ids of `ADAPTER_TYPES` in order, equal `Object.keys(PARAMETER_SHAPES)`
- [x] 1.2 Confirm the change fails first: `npm run typecheck` fails on the missing `AdapterTypeId` export and the widened types (record the output)

## 2. Backend: Key the tables by adapter type (design Decisions 1-3)

- [x] 2.1 Export `AdapterTypeId = keyof typeof PARAMETER_SHAPES` from `providerTypes.ts` and use it in `ADAPTER_VENDORS`
- [x] 2.2 Type `CONNECTION_CHECKS` as `Record<AdapterTypeId, ConnectionCheck>`. Widen it at the two lookups by a stored `adapterType` (`runConnectionCheck` and the connection test route in `adminProviderRoutes.ts`), as `db.ts` does for `ADAPTER_VENDORS`
- [x] 2.3 Turn `ADAPTER_TYPE_DEFINITIONS` into `Record<AdapterTypeId, Omit<AdapterType, "id">>`, type `AdapterType.id` as `AdapterTypeId`, and derive `ADAPTER_TYPES` with the same order and key order
- [x] 2.4 `npm run typecheck`, `npm run lint` and the tests from 1.1 pass

## 3. Backend: Prove acceptance criterion 2 by hand (design Risks)

- [x] 3.1 Add a scratch key to `PARAMETER_SHAPES`, run `npm run typecheck`, and record the errors that name `CONNECTION_CHECKS`, `ADAPTER_VENDORS` and the form table
- [x] 3.2 Revert the scratch key and confirm `git diff` shows no trace of it

## 4. Backend: Review and Update Existing Unit Tests (MANDATORY)

- [x] 4.1 Review `provider-types.test.ts`, `provider-connection-check.test.ts`, `admin-provider-connection-test-route.test.ts` and `telemetry-provider-name.test.ts`. Keep them unchanged unless a test only re-checks what 1.1 now covers. Record the decision

## 5. Backend: Run Unit Tests and Verify Database State (MANDATORY)

- [x] 5.1 Capture the pre-test baseline of `provider_profiles` (row count and checksum) in the local store
- [x] 5.2 Run the targeted tests (`adapter-type-tables`, `provider-types`, `provider-connection-check`, `admin-provider-connection-test-route`) with a scratch `DB_PATH` and `PROJECTS_ROOT`
- [x] 5.3 Run the full backend suite (`npm test`) with a scratch `DB_PATH` and `PROJECTS_ROOT`, plus `npm run typecheck` and `npm run lint`. Coverage of the touched modules must not decrease
- [x] 5.4 Verify the post-test state of the local store matches 5.1, and restore it if it does not
- [x] 5.5 Create report `openspec/changes/key-per-adapter-tables/reports/YYYY-MM-DD-step-5-unit-test-and-db-verification.md`
- [x] 5.6 Mark step complete only after tests pass and the report exists

## 6. Backend: Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 6.1 Before section 2, start the backend from the base commit on a scratch store with literal env vars and save the `GET /admin/provider-types` response
- [x] 6.2 On this branch, start the backend the same way, save the same response, and `diff` the two files (expected: identical)
- [x] 6.3 `POST /admin/provider-profiles/:id/test` for a profile with no key (expected: `no-key` with the same `covers` as before), for an unknown id (404), and without the password (401)
- [x] 6.4 Confirm no request changed the store (no create, update or delete endpoints are involved), then stop the servers
- [x] 6.5 Create report `openspec/changes/key-per-adapter-tables/reports/YYYY-MM-DD-step-6-manual-endpoint-testing.md`

## 7. Frontend: E2E Testing with Playwright MCP (MANDATORY if applicable - AGENT MUST EXECUTE)

- [x] 7.1 Start the frontend and backend on scratch stores
- [x] 7.2 Open `/admin`, start adding a profile for each stage, and check that the adapter type choices, the form fields and the connection-check note match the base commit
- [x] 7.3 Stop the servers and remove the scratch stores
- [x] 7.4 Create report `openspec/changes/key-per-adapter-tables/reports/YYYY-MM-DD-step-7-e2e-playwright.md`

## 8. Update Technical Documentation (MANDATORY)

- [ ] 8.1 Add to `docs/backend-standards.md` the rule that a table holding per-adapter-type behaviour is keyed by `AdapterTypeId`
- [ ] 8.2 Confirm `docs/api-spec.yml` and `docs/data-model.md` need no change (no contract or schema change)
- [ ] 8.3 Run `graphify update .`

## 9. Delivery

- [ ] 9.1 Commit on the feature branch
- [ ] 9.2 Ask before pushing. Open a PR into `feature/entrega-3-JAME` that explains the architectural motivation and copies the audit table from design.md § Context, including the per-stage adapter construction gap left for JOS-263
