# Step 9: unit tests and database verification (JOS-218, manage-providers-from-admin)

Date: 2026-10-21. Branch `feature/jos-218-manage-providers-from-admin`, on top of `origin/main` at `a0f9cdd0` (JOS-171 merged, #86 and #87).

## 9.1 Baseline

This worktree is new: before any run, `backend/data/` did not exist, there was no `backend/.secrets.json`, and none of `FAL_API_KEY`, `ELEVENLABS_KEY`, `OPENAI_KEY`, `RUNNINGHUB_API_KEY`, `ADMIN_PASSWORD` or `PROVIDER_KEY_PATH` was set in the environment. There was therefore no default store to snapshot. The verifying runs used a scratch `DB_PATH` and `PROJECTS_ROOT` in the session scratchpad. Development runs without them created `backend/data/` (git-ignored); it was deleted again.

## 9.2-9.3 Commands and results

| Check | Result |
| --- | --- |
| `npm run typecheck`, backend and frontend | clean (exit 0) |
| `npm test`, backend (scratch store, no key in the environment) | 1967 passed, 5 skipped (142 files passed, 4 skipped) |
| `npm test`, frontend | 287 passed (6 files) |

Tests added: 96. Backend 86: `provider-profiles-storage` (5), `provider-key-store` (18), `provider-types` (13), `provider-adapter-parameters` (5), `provider-registries` (9), `provider-profile-parameters` (6), `script-moderation-key` (2), `active-video-durations` (4), `admin-provider-profiles-route` (24). Frontend 10: `provider-profiles-section` (9) and one in `active-providers-section`. The base counts follow by subtraction: 1881 backend and 277 frontend.

Existing tests changed (task 8.1), each for a reason the design states:

- `provider-binding.test.ts`, "show the configured image model for a scene bound by name": the settings now only seed the first profile, so the test restarts as a first start (it resets the store before the new settings are read).
- `settings-behaviour.test.ts`: its `restartWith` helper clears the provider profiles, for the same reason.
- `session-api-surface.test.ts`: the "no PUT, PATCH or DELETE route" guard also exempts `admin/provider-profiles` (`PUT`, `DELETE`), as it already exempts `admin/providers` and the telemetry consent.

No other existing test needed an edit: the factories keep their option bags with defaults equal to the settings, the stub seams are unchanged, and a store with no profiles is seeded the first time anything asks for one.

**Coverage (task 8.3):** the project has no coverage tool installed and its standard asks for named branches, not a percentage, so none was added. The evidence is the test count above and the scenario map below.

## 9.4 Post-test state

`backend/data/` does not exist (a test that stored a key without its own `PROVIDER_KEY_PATH` had left `backend/data/provider-keys.key`; it now sets one), no `.secrets.json` was left behind, and the scratch store was outside the checkout.

## 8.2 Scenario and acceptance-criterion coverage

provider-profiles (spec) -> tests
- Two profiles of one adapter type: provider-registries.test.ts "offers a profile added later with its label"; admin-provider-profiles-route.test.ts "creates a profile (201) ..." (listed next to the seeded one)
- An adapter type the stage does not ship: admin-provider-profiles-route.test.ts "refuses an adapter type the stage does not ship"; provider-types.test.ts "rejects an adapter type it does not ship"
- No host can be set: provider-types.test.ts "rejects an unknown parameter, including a host or a full URL", "rejects a model or endpoint written as a URL"; the route test "refuses an unknown or host-like parameter ..."
- Upgrade with existing sessions: provider-registries.test.ts "an upgraded store"; provider-profiles-storage.test.ts (the seeded ids); provider-key-store.test.ts "resolves a legacy image binding to the seeded profile"; provider-binding.test.ts (the legacy aliases)
- A settings edit after the first start: provider-profiles-storage.test.ts "keeps the stored profile and logs one notice ..."
- Add a provider: admin-provider-profiles-route.test.ts "creates a profile (201)", "can be made active once it exists"; frontend provider-profiles-section.test.tsx "adds a provider through a form ..."
- Edit a parameter: route test "edits the label and parameters ..."; provider-registries.test.ts "uses an edited parameter on the next resolution ..."; provider-profile-parameters.test.ts "sends the edited voice and speed ..."
- Without the password: route test "Administrator access (AC8)" (all five routes); frontend "locks the page again when a request is refused with 401"
- Several problems at once, and the shortest duration above the bound: route test "refuses an unknown or host-like parameter and a duplicate label, listing every problem", "refuses a video profile whose shortest duration ..."; provider-types.test.ts "lists every problem with its field and never a value"
- A profile without a key cannot be active, a retired profile is not offered: route test "refuses a profile that is not usable, with the reasons", "retires a profile a scene is bound to ..."; provider-registries.test.ts "keeps a retired profile resolvable but does not offer it"
- Delete the active provider, one with bound work, an unused one: route test "DELETE /admin/provider-profiles/{id}" (409, retired, removed); frontend "asks for confirmation before deleting ...", "shows the stage when deleting the active provider is refused"
- A parameter change applies to the next request and rewrites nothing: provider-registries.test.ts "uses an edited parameter on the next resolution, while a call already holding the old adapter is unaffected"; provider-profile-parameters.test.ts (voice request); the stored durations and attempts are not touched by any write of the profile module
- The admitted durations come from the active video provider: active-video-durations.test.ts (all four tests)
- Diagnostics name a provider by its profile: provider-profile-parameters.test.ts "diagnostics name a provider by its profile"

provider-credentials (spec) -> tests
- Enter a key, keep it on edit, never logged: provider-key-store.test.ts "does not keep the key in clear text ..."; route tests "creates a profile ... keeps it out of the database in clear text", "edits ... keeps the key when apiKey is absent", "a key sent to the API is never logged"
- A key is shown only as a status and a hint: provider-key-store.test.ts "keyStatusOf"; route tests "lists the five seeded profiles ...", "the key never leaves the server"; frontend "lists each stage's profiles ... the key status and hint"
- The application asks for a key by stage role: provider-key-store.test.ts "stageApiKey" (bound and unbound); provider-adapter-parameters.test.ts (each factory uses the loader's key)
- Existing keys keep working: provider-key-store.test.ts "falls back to the legacy environment name ...", "falls back to the secrets file ...", "prefers the stored key ...", "names the stage role, never a value, when there is no key"
- The reasoning key also serves script moderation: script-moderation-key.test.ts

provider-and-parameter-settings and active-provider-selection (deltas) -> tests
- Fresh install seeds one profile per stage: provider-profiles-storage.test.ts "creates one profile per stage ..."
- Admitted durations drive segmentation and clip requests: active-video-durations.test.ts; the existing segmentation, clip-duration and settings-behaviour tests still pass
- A provider the stage has no adapter for on a first start; an API key in the override file: existing `providerConfig.test.ts` and `settings-behaviour.test.ts` tests, unchanged
- A provider parameter edited on /admin without a restart: provider-registries.test.ts (the edit reaches the next resolution)
- Only a usable provider can be chosen: route test "refuses a profile that is not usable ..."; JOS-171's `admin-providers-route.test.ts` (unknown provider, 400) unchanged

JOS-218 ACs: AC1 = add tests; AC2 = edit tests; AC3 = delete tests; AC4 = "can be made active once it exists" with JOS-171's binding tests; AC5 = the validation and usable tests; AC6 = the key store, masking and log tests; AC7 = `stageApiKey` and the factory tests; AC8 = "Administrator access (AC8)"; AC9 = the upgrade, seeding and legacy-key tests.
