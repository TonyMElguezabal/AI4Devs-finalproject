## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create branch `feature/jos-226-price-per-unit` from `origin/main` with `--no-track`, in the worktree `../AI4Devs-jos-226`
- [x] 0.2 Verify the branch was created and is the current branch of that worktree

## 1. Gate

- [x] 1.1 `git fetch`. Confirm JOS-175 (#91) is on `origin/main` (ADR 0008 and PRD v1.16) and check whether the JOS-172 archive (#92) is merged; it does not block this change.
- [x] 1.2 Confirm the base still matches design.md § Context: `PARAMETER_SHAPES` reused by `config/settings.ts`, `validateProviderParameters`, `ADAPTER_TYPES` field descriptors, the drift notice in `seedProviderProfiles`, and adapters reading named fields only. Update design.md first if not.
- [x] 1.3 Draft the next PRD version (expected v1.17; §11.4: the price per unit and currency per provider, optional, both or neither, per stage's billed unit, zero is a price, entered only on `/admin`) (applied directly as v1.18 in `docs/PRD.md`, because the repository PRD is already at v1.17; marked awaiting the product owner's approval).

## 2. Backend: price validation and units (TDD; design Decisions 1, 2, 3)

- [x] 2.1 Write failing tests for `validateProviderParameters` on every adapter type: no price is valid; a price with a currency is valid and the currency is stored upper-case; zero is valid; a negative price, a non-number, an unknown or malformed currency, a price without a currency and a currency without a price are each a problem on `pricePerUnit` or `priceCurrency`, listed together with other parameter problems, with no value in the message.
- [x] 2.2 Add `PRICE_SHAPE` (with the both-or-neither check) to the schema built in `validateProviderParameters`, not to `PARAMETER_SHAPES`. Make 2.1 pass.
- [x] 2.3 Write failing tests: `BILLED_UNITS` names the unit of each stage; every adapter type in `ADAPTER_TYPES` ends with the "Price per <unit>" number field and the "Currency" text field, both not required.
- [x] 2.4 Add `BILLED_UNITS` and the two field descriptors. Make 2.3 pass.
- [x] 2.5 Write failing tests: a settings file whose provider section has `pricePerUnit` or `priceCurrency` is invalid (unknown key); a priced first profile whose other parameters equal the settings section raises no drift notice at start-up, and a different model still does.
- [x] 2.6 Make `seedProviderProfiles` compare the parameters without the price keys. Make 2.5 pass.

## 3. Backend: admin API and no side effects (TDD; design Decision 5)

- [x] 3.1 Write failing route tests: `POST` and `PUT /admin/provider-profiles` save a price and currency and `GET` returns them; an invalid price is a 400 listing every problem with nothing stored; an edit without the price fields removes the price; 401 without Administrator access with nothing stored; `GET /admin/provider-types` lists the two fields with the unit in the label.
- [x] 3.2 Write failing tests that a priced profile stays usable and active, that a session binds to it as before, and that the image adapter's request body built from a priced profile has no `pricePerUnit` or `priceCurrency`.
- [x] 3.3 Make 3.1 and 3.2 pass (expected: no route code change; fix whatever fails).

## 4. Frontend: optional fields on the provider form (TDD; design Decision 4)

- [x] 4.1 Write failing component tests: the add and edit forms of each stage show "Price per <unit>" and "Currency"; saving with both empty sends no price keys; saving a price sends a number and the currency; the edit form shows the stored price; clearing both and saving sends no price keys; a 400 on `pricePerUnit` shows the problem and keeps the input.
- [x] 4.2 Leave non-required blank fields out in `ProfileForm.handleSubmit` and update the frontend types if needed. Make 4.1 pass.

## 5. Review and Update Existing Unit Tests (MANDATORY)

- [x] 5.1 Review the tests that assert the exact list of field descriptors or the exact parameters of a profile (`provider-types`, `provider-profiles`, `admin-provider-routes`, `settings-*`, `ProviderProfilesSection`) and update them for the two new fields.
- [x] 5.2 Map every scenario in `specs/provider-pricing/spec.md` and JOS-226 AC1–AC3 to at least one test. List the mapping in the step 6 report.
- [x] 5.3 Confirm module test coverage has not decreased (compare against this change's propose commit).

## 6. Run Unit Tests and Verify Database State (MANDATORY)

- [x] 6.1 Capture the pre-test baseline of the default store: row counts per table (including `provider_profiles`), applied migrations, the master key file's presence, and `data/projects/` contents.
- [x] 6.2 Run the targeted tests from groups 2–4.
- [x] 6.3 Run `npm run typecheck` and the full `npm test` in both `backend` and `frontend`, with no `backend/.secrets.json`, no settings override, no vendor key in the environment, and scratch `DB_PATH`, `PROJECTS_ROOT` and `PROVIDER_KEY_PATH`.
- [x] 6.4 Verify the post-test state matches the baseline; restore it if not.
- [x] 6.5 Create the report `openspec/changes/add-provider-price-per-unit/reports/YYYY-MM-DD-step-6-unit-test-and-db-verification.md`.
- [x] 6.6 Mark this step complete only after the tests pass and the report file exists.

## 7. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 7.1 Start the real server on a scratch store, projects folder and `PROVIDER_KEY_PATH`, with `ADMIN_PASSWORD` set and stub adapters.
- [x] 7.2 Without Administrator access: `PUT` a price on a profile, 401, store unchanged.
- [x] 7.3 With access: `GET /admin/provider-types` shows the unit per stage; price the voice profile (`0.00003`, `usd`), read it back as `USD`; send each invalid case and confirm the 400 lists the problems; price one profile at 0; clear a price; confirm in the SQLite file that `parameters` holds the price and nothing else changed.
- [x] 7.4 Restart with a settings file equal to the seeded parameters: no drift notice in the log; a settings file with a price fails with the unknown-key message.
- [x] 7.5 Run a session on the priced active providers and confirm it completes and that the stub saw no price in a request.
- [x] 7.6 Stop the server, delete the scratch store and folder, confirm the default store is untouched, and save `openspec/changes/add-provider-price-per-unit/reports/YYYY-MM-DD-step-7-manual-endpoint-testing.md`.

## 8. E2E Testing with the browser (MANDATORY if applicable - AGENT MUST EXECUTE)

- [x] 8.1 Applicability: the `/admin` provider form changes, so this step applies.
- [x] 8.2 Run the backend (scratch store and key file) and the frontend. Unlock `/admin`; each stage's form shows "Price per <unit>" and "Currency".
- [x] 8.3 Price a provider, reload, see the stored price in the edit form; enter a currency without a price and see the problem on the field; clear the price and save.
- [x] 8.4 Restore the environment and save `openspec/changes/add-provider-price-per-unit/reports/YYYY-MM-DD-step-8-e2e.md`.

## 9. Update Technical Documentation (MANDATORY)

- [x] 9.1 `docs/PRD.md`: apply the approved text as the next version (keep the previous one as `docs/PRD-v<prev>.md`) with a §16 change-log entry; if not yet approved, keep the status "awaiting the product owner's approval" and do not merge.
- [x] 9.2 `docs/api-spec.yml`: the two optional parameters in the profile and adapter-type schemas, with an example.
- [x] 9.3 `docs/data-model.md`: the price keys inside `provider_profiles.parameters`, both or neither, upper-case currency, unpriced versus zero.
- [x] 9.4 `docs/development_guide.md` (the `/admin` providers part): entering a price, and that the settings files do not take one.
- [x] 9.5 Run `graphify update .`.
