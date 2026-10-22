## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create branch `feature/jos-218-manage-providers-from-admin` from `origin/main` with `--no-track`, in the worktree `../AI4Devs-jos-218`
- [x] 0.2 Verify the branch was created and is the current branch of that worktree

## 1. Gate

- [x] 1.1 `git fetch`. Confirm JOS-171 (#86) is on `origin/main`, and that PR #87 (the archived `active-provider-selection` spec) is merged. If #87 is not merged, stop and ask for it.
- [x] 1.2 Confirm the base still matches design.md § Context: the five factories and their `loadKey` seams, the registries with `labels` and `aliases`, `activeProviderId`, the `/admin` child plugin, and the stored binding ids. Update design.md first if anything differs.
- [x] 1.3 Draft the next PRD version (v1.14: §2.1, §2.3, §11, §11.2, §12.3 and the credentials rule, plus the exceptions to JOS-174's "files only" rules for providers and keys) and mark it as awaiting the product owner's approval, before any code.
- [x] 1.4 Reword the requirement "Only a shipped adapter can be chosen" of `openspec/specs/active-provider-selection/spec.md` as "Only a usable provider can be chosen" in a MODIFIED delta of this change, using the full current block (design Decision 6).

## 2. Backend: storage and the first profiles (TDD; design Decisions 1, 8)

- [x] 2.1 Write failing migration tests: `provider_profiles` exists with the columns of Decision 1; migration 19 inserts no rows.
- [x] 2.2 Add migration 19. Make 2.1 pass.
- [x] 2.3 Write failing tests for `seedProviderProfiles(settings)`: a stage with no profile gets one with the stored id of Decision 1 (`ElevenLabs`, `Fal.ai`, `RunningHub`, `openai-decomposition`, `elevenlabs-forced-alignment`), the adapter type of its stage, the label from `name` and the parameters without `name`; a second call changes nothing; a changed settings file after the first start changes no profile and logs one notice; the legacy image and video aliases still resolve.
- [x] 2.4 Implement the profile repository (list, get, insert, update, retire, remove, references check) and `seedProviderProfiles`, called at start-up after the migrations. Make 2.3 pass.

## 3. Backend: the key store (TDD; design Decision 5)

- [x] 3.1 Write failing tests for the key store: a key written is not in the database in clear text; it reads back; each write uses a new IV; the master key file is created with mode `0600` at `PROVIDER_KEY_PATH` and is reused; a tampered ciphertext fails with an error that contains no key; an unreadable master key makes `keyFor` fail without printing a value.
- [x] 3.2 Implement the key store with `node:crypto` AES-256-GCM. Make 3.1 pass.
- [x] 3.3 Write failing tests for `keyFor(profileId)` and `stageApiKey(stage, boundId?)`: the stored key wins; a seeded profile falls back to its legacy environment name and then to `.secrets.json`; a profile added on `/admin` has no fallback; a missing key fails with a message naming the stage role and never a value; `stageApiKey` without a bound id uses the active profile.
- [x] 3.4 Implement `keyFor`, `stageApiKey` and the key status and hint (Decision 5). Make 3.3 pass.

## 4. Backend: adapter types and registries from profiles (TDD; design Decisions 2, 3, 4)

- [x] 4.1 Write failing tests for the adapter-type catalogue: one entry per stage with its parameter schema, field descriptors and defaults; a schema rejects an unknown parameter, a host or URL, a wrong type and an out-of-range value, listing every problem with its field; the settings schema accepts exactly what the schemas accept (one rule, written once).
- [x] 4.2 Add `providerTypes.ts` and make `config/settings.ts` reuse the parameter schemas. Make 4.1 pass.
- [x] 4.3 Write failing tests for each factory taking its parameters and a key loader: the image model, the alignment endpoint path, the reasoning model and the video endpoint path come from the profile's parameters (the voice parameters travel in the synthesis request, which the voice phase builds from the bound profile, task 4.7), and each request uses the key from the loader; no factory reads a start-up constant or a vendor key name.
- [x] 4.4 Change the five factories to take `(parameters, loadKey)`. Make 4.3 pass.
- [x] 4.5 Write failing tests for the registries built from the profiles: one adapter per profile; a retired profile resolves but is not selectable; `defaultIdentifier` is the seeded profile; adding, editing, retiring or removing a profile or a key rebuilds the registries, so the next resolution uses the new parameters; an in-flight call keeps its instance; the stub seams still replace a registry.
- [x] 4.6 Implement the registries from the profiles and `rebuildRegistries()`. Make 4.5 pass.
- [x] 4.7 Write failing tests that a bound stage retried after a parameter edit is sent with the new parameter and the same provider, that its earlier attempts and stored values are unchanged, and that `stageDiagnostics` shows the profile's display name and model (no "Unknown provider").
- [x] 4.8 Take the display name and model in `stageDiagnostics.ts` from the profile, and load every key through `stageApiKey`. Make 4.7 pass.
- [x] 4.9 Write failing tests that script moderation uses the active reasoning profile's key (stored key; environment fallback), then change `scriptModeration.ts` (design Decision 11).

## 5. Backend: admitted durations follow the active video provider (TDD; design Decision 4)

- [x] 5.1 Write failing tests for `activeVideoDurations()`: it returns the active video profile's range; a change of the active provider changes the next call; segmentation, clause splitting, scene registration and the clip-duration request use it instead of the start-up constants; the segmentation lower bound is still the setting.
- [x] 5.2 Replace `VIDEO_ADMITTED_DURATIONS_SECONDS` and `SEGMENTATION_UPPER_BOUND_SECONDS` at their use sites (`admittedDurations.ts`, `db.ts`, `segmentation.ts`, `clauseSplitting.ts`, `sceneRegistration.ts`). Make 5.1 pass.
- [x] 5.3 Write failing tests: a scene whose stored requested duration the active video provider does not admit fails as not retryable before any binding, with a message naming the duration and the provider, sends nothing, stays unbound, and its manual retry works after the active provider is switched back.
- [x] 5.4 Add the check before the video bind point. Make 5.3 pass.

## 6. Backend: admin API (TDD; design Decisions 6, 7, 9)

- [x] 6.1 Write failing route tests:
  - `GET /admin/provider-types` lists the adapter types per stage with their field descriptors;
  - `GET /admin/provider-profiles` lists every profile with `keyStatus`, `keyHint`, `usable`, `problems`, `active` and no key in any field;
  - `POST` creates a profile (201) and refuses an unknown adapter type for the stage, an unknown or host-like parameter, a duplicate display name, and the video cross-check, listing every problem (400, nothing stored);
  - `PUT /admin/provider-profiles/{id}` edits the label and parameters, keeps the key when `apiKey` is absent, replaces it when present, and never changes the stage or the adapter type (404 for an unknown id);
  - `DELETE` answers 409 naming the stage for an active profile, `retired` for a profile with bindings or attempts, `removed` otherwise;
  - `PUT /admin/providers/{stage}` refuses a profile that is not usable (409 with the reasons) and a retired one (400);
  - every route returns 401 without Administrator access and writes nothing (AC8);
  - a key sent to the API is in neither the log file nor the standard output.
- [x] 6.2 Implement the routes with zod schemas behind JOS-173's gate and extend the surface test's list of deliberate app-level settings routes. Make 6.1 pass, and confirm the routes appear in the generated OpenAPI document.

## 7. Frontend: the "Providers" section on /admin (TDD; design Decision 10)

- [x] 7.1 Write failing component tests:
  - per stage, the profiles with label, adapter type, key status with hint, and the reason when a profile is not usable;
  - the "Add provider" form is generated from the adapter type's field descriptors, its key field is a password input that starts empty, and a 400 shows every listed problem and keeps the input;
  - the edit form shows the current parameters, an empty key field, and an empty key keeps the key;
  - delete asks for confirmation inside the page, explains a `retired` answer, and shows the 409 stage message;
  - a 401 locks the page again;
  - the active-provider selectors of JOS-171 offer the non-retired profiles.
- [x] 7.2 Add the client calls and the section inside the `/admin` page. Make 7.1 pass.

## 8. Review and Update Existing Unit Tests (MANDATORY)

- [x] 8.1 Review the tests that build registries, use the start-up constants or load vendor keys: `*-provider*`, `image-stage`, `video-stage`, `voice-over-*`, `decomposition-*`, `script-segmentation`, `clip-duration-*`, `scene-registration-*`, `script-moderation*`, `stage-diagnostics*`, `provider-config*`, `credentials*`, the `active-provider-*` tests and the server stub wiring. Update them for the new factory signatures and for `activeVideoDurations()`.
- [x] 8.2 Map every scenario in `specs/provider-profiles/spec.md`, `specs/provider-credentials/spec.md` and `specs/provider-and-parameter-settings/spec.md` and JOS-218 AC1–AC9 to at least one test. List the mapping in the step 9 report.
- [x] 8.3 Confirm module test coverage has not decreased (compare against this change's propose commit).

## 9. Run Unit Tests and Verify Database State (MANDATORY)

- [x] 9.1 Capture the pre-test baseline of the default store: row counts per table (including `provider_profiles` and `active_providers`), applied migrations, the master key file's presence, and `data/projects/` contents.
- [x] 9.2 Run the targeted tests from groups 2–7.
- [x] 9.3 Run `npm run typecheck` and the full `npm test` in both `backend` and `frontend`, with no `backend/.secrets.json`, no settings override and no vendor key in the environment.
- [x] 9.4 Verify the post-test state matches the baseline (no `provider-keys.key` left in the checkout); restore it if not.
- [x] 9.5 Create the report `openspec/changes/manage-providers-from-admin/reports/YYYY-MM-DD-step-9-unit-test-and-db-verification.md`.
- [x] 9.6 Mark this step complete only after the tests pass and the report file exists.

## 10. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 10.1 Start the real server on a scratch store, scratch projects folder and scratch `PROVIDER_KEY_PATH`, with two stub adapters per stage registered through the test seams, and `ALLOW_TEST_ENDPOINTS=1`. Start it once on an **old-shaped** store (migrated up to 18, with sessions bound to `Fal.ai` and `ElevenLabs`) to prove the upgrade.
- [x] 10.2 Upgrade check: after the first start the five seeded profiles exist with the stored ids, no key is stored, and a retry of an old session is sent through `Fal.ai` using the key from the environment.
- [x] 10.3 Call every new route without Administrator access: 401 and the store is unchanged.
- [x] 10.4 With Administrator access: add an image profile with a key; the list shows `keyStatus: "stored"` and the hint, and the key appears nowhere in the response, the SQLite file (`strings`) or the server log; edit its model; choose it as active; a new session's scenes are bound to it and their requests carry its model and key.
- [x] 10.5 Delete: the active profile is refused with 409; a profile with bound scenes is retired and still serves a manual retry; an unused one is removed.
- [x] 10.6 Duration rule: switch the active video profile to one that does not admit a scene's stored duration; the scene fails before binding with the message; switch back and retry.
- [x] 10.7 Restart: profiles, keys and the choice hold.
- [x] 10.8 Delete the created sessions, profiles, key file and the scratch store and folder. Confirm the default store is untouched. Save `openspec/changes/manage-providers-from-admin/reports/YYYY-MM-DD-step-10-manual-endpoint-testing.md`.

## 11. E2E Testing with the browser (MANDATORY if applicable - AGENT MUST EXECUTE)

- [x] 11.1 Applicability: a new `/admin` section, so this step applies.
- [x] 11.2 Run the backend (scratch store and key file, two stub adapters per stage) and the frontend. Without the password: no provider management. With it: the profiles of every stage with their key status.
- [x] 11.3 Add a provider through the form (adapter type, name, parameters, key); the key field is empty again after saving and shows only status and hint; edit a parameter and keep the key by leaving the field empty; choose it as active; reload: everything persists.
- [x] 11.4 Delete the active provider (refused with the stage named), delete one with work bound to it (explained as retired), delete an unused one.
- [x] 11.5 Start a session and confirm in its scene diagnostics the new provider's display name.
- [x] 11.6 Restore the environment and save `openspec/changes/manage-providers-from-admin/reports/YYYY-MM-DD-step-11-e2e.md`.

## 12. Update Technical Documentation (MANDATORY)

- [x] 12.1 `docs/PRD.md`: the next version (keep the previous one as `docs/PRD-v<prev>.md`) with the changed sections and a §16 change log entry.
- [x] 12.2 `docs/api-spec.yml`: the new routes, with 200, 201, 400, 401, 404 and 409.
- [x] 12.3 `docs/data-model.md`: `provider_profiles`, the key encryption and the master key file, the retire rule, and the seeded ids.
- [x] 12.4 `docs/backend-standards.md`: the role API (`stageApiKey`), factories take `(parameters, loadKey)`, no code names a vendor key, `activeVideoDurations()`, and how the registries are rebuilt.
- [x] 12.5 `docs/frontend-standards.md`: the accessible names of the Providers section.
- [x] 12.6 `docs/development_guide.md` and the readme's provider and credentials sections: managing providers and keys on `/admin`, the legacy environment variables as a fallback for the seeded profiles, `PROVIDER_KEY_PATH` and its limit.
- [x] 12.7 Create the follow-up Linear tickets "Test connection for a provider" (JOS-220) and "Keep the provider key file outside the database folder in packaged builds" (JOS-221) (assignee jose.elguezabal@gmail.com, label `type:feature`), and link them to JOS-218.
- [x] 12.8 Run `graphify update .`.
