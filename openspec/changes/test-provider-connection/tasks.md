## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create feature branch `feature/jos-220-test-provider-connection` from `main` (no upstream)
- [x] 0.2 Verify the current branch

## 1. Confirm the vendor checks (spike)

- [x] 1.1 With the real keys (never printed), send each candidate request in `design.md` once by curl, plus once with a deliberately wrong key; record the status codes and body shape (no key, no balance) in `reports/`
- [x] 1.2 Decide the Fal check (free endpoint or one minimal paid generation) and update `design.md` Decision 6 and the table
- [x] 1.3 Record how each vendor answers an unknown model or voice (404 or other) and adjust the mapping in Decision 2 if needed

## 2. Backend tests first (TDD)

- [x] 2.1 Test each adapter type's check against a stubbed `fetch`: exactly one request, to the vendor host, with the key in the vendor's header or body, and the mapping of 2xx, 401/403, 404, other status, network error and timeout to the outcomes
- [x] 2.2 Test that every adapter type in the catalogue has a check, and that `GET /admin/provider-types` returns `connectionCheck` for each
- [x] 2.3 Test the route: 401 without the password and no vendor request; 404 for an unknown profile; `no-key` with no vendor request; 409 `charge-not-accepted` for a charged check without `acceptCharge`, with no vendor request
- [x] 2.4 Test that a test writes nothing: profile view, key status, active providers and the `provider_requests` and `stage_attempts` row counts are identical before and after, for a pass and a failure
- [x] 2.5 Sentinel test: a stubbed vendor echoes the key in its error body; the key appears nowhere in the response or the captured logs; the response has no field outside the closed schema

## 3. Backend implementation

- [ ] 3.1 Add `backend/src/providerConnectionCheck.ts` with one check per adapter type (Decision 2)
- [ ] 3.2 Add `connectionCheck: { charged, covers }` to the provider-type catalogue and its response schema
- [ ] 3.3 Add `POST /admin/provider-profiles/:id/test` to `adminProviderRoutes.ts` with the closed response schema (Decisions 1, 3, 5)

## 4. Frontend tests first, then implementation

- [ ] 4.1 Test `ProviderProfilesSection`: a "Test connection" button per profile with a key; disabled with unsaved changes and while a test runs; a charged type shows the charge notice and sends only after confirmation; each outcome shows its sentence and the `covers` text; the key never appears
- [ ] 4.2 Add the API client call and the button, notice, confirmation and result line

## 5. Review and Update Existing Unit Tests (MANDATORY)

- [ ] 5.1 Review provider-types and provider-profile route tests, the adapter no-hidden-retries guard and the API surface tests for assumptions the new field and route break; update them

## 6. Run Unit Tests and Verify Database State (MANDATORY)

- [ ] 6.1 Capture the pre-test database baseline (isolated `DB_PATH` and `PROJECTS_ROOT`)
- [ ] 6.2 Run targeted tests for the new module, route and section
- [ ] 6.3 Run `npm run typecheck`, `npm run lint` and `npm test` in `backend` and `frontend`
- [ ] 6.4 Verify post-test database state and restore if needed
- [ ] 6.5 Create report `reports/YYYY-MM-DD-step-6-unit-test-and-db-verification.md`
- [ ] 6.6 Mark the step complete only after tests pass and the report exists

## 7. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [ ] 7.1 Start the backend with an isolated data folder and the Administrator password; curl the test route for a profile with a valid key, a wrong key, no key, a charged type without `acceptCharge`, and without the password
- [ ] 7.2 Confirm the profile is unchanged after each call
- [ ] 7.3 Restore the data folder and document commands and responses (keys redacted) in `reports/YYYY-MM-DD-step-7-curl-endpoint-testing.md`

## 8. E2E Testing with Playwright MCP (MANDATORY - AGENT MUST EXECUTE)

- [ ] 8.1 On `/admin`, test a profile with a valid key and one with a wrong key; check the result sentences; for a charged type, check the notice appears and nothing is sent until confirmed
- [ ] 8.2 Record the run and screenshots in `reports/YYYY-MM-DD-step-8-e2e.md`

## 9. Update Technical Documentation (MANDATORY)

- [ ] 9.1 Update `docs/api-spec.yml` with the new route and the catalogue field
- [ ] 9.2 Update the PRD (new version, previous kept): §2.1 and §11.2 describe the connection test, its cost disclosure and its coverage
- [ ] 9.3 Update `docs/backend-standards.md` (provider profiles section): one check per adapter type, a new adapter type needs one
- [ ] 9.4 Run `graphify update .`
- [ ] 9.5 Open the pull request linking JOS-220; archive the change after merge
