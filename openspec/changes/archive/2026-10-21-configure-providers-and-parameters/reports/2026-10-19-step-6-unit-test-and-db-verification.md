# Step 6: unit tests and database verification (JOS-174, configure-providers-and-parameters)

Date: 2026-10-19. Branch `feature/jos-174-configure-providers`, base `c9e4508c` (the propose commit, on top of `origin/feature/entrega-2-JAME`).

## 6.1 Baseline

This worktree is new: before any run, `backend/data/` did not exist, there is no `backend/.secrets.json` and no `backend/data/settings.json`. There was therefore no default store to snapshot (no tables, no migrations, no `data/projects/`), and no local credential or settings override could mask a failure. Every run below used a scratch `DB_PATH` and `PROJECTS_ROOT` (folders in the session scratchpad), and `vitest.config.ts` pins `SETTINGS_PATH` to a missing file, so a local override cannot change a test.

## 6.2-6.3 Commands and results

| Check | Result |
| --- | --- |
| `npm run typecheck`, backend | clean (exit 0) |
| `npm test`, backend (scratch paths) | 1759 passed, 5 skipped (120 files passed, 4 skipped) |
| `npm run typecheck`, frontend | clean (exit 0) |
| `npm test`, frontend | 248 passed (3 files). No frontend code changed in this story |
| Targeted (16 files: the six new ones plus every file touched) | 271 passed |

Tests added: `settings.test.ts` (29), `providers-settings.test.ts` (13), `settings-behaviour.test.ts` (15), `provider-requests.test.ts` (6), `provider-binding.test.ts` (12), two in `server-runtime-load.test.ts` (a real `node src/server.ts` with an invalid override, and with none) and one in `video-time-limit.test.ts`: 78 in total, so the base is 1681 by subtraction (derived, the base suite was not re-run). No test case was removed. Five assertions in existing tests now read the limit through the `limitSeconds` helper (`test/phaseLimit.ts`) instead of using the constant directly, with the same values.

**Coverage (task 5.3):** the project has no coverage tool installed and its standard asks for named branches, not a percentage, so no tool was added. The evidence is the count above, the `git diff c9e4508c` check that no `it`/`test`/`describe` line was removed, and the mapping below.

**The mutation check:** with the guard in `orchestrator.ts` replaced by `elapsed > (videoTimeoutMs ?? 0)`, the new "never fails a clip ... no maximum time" test fails; the code was restored from git.

**One flaky test, recorded:** in the first full run `orchestrator.test.ts > retry budget ... a transient failure consumes 1 + RETRY_BUDGET attempts` timed out in a `waitFor` (1720 passed, 1 failed). It passed 3 of 3 alone, and did not recur in the two full runs after it (1757, then 1759 passed). Treated as load-related; not caused by this change as far as these runs show, but not proven on the base.

## 6.4 Post-test state

`backend/data/` still does not exist, no `.secrets.json` or `data/settings.json` was created, and `git status` is clean. The scratch folders live outside the repository.

## Findings that changed the artifacts (before the code)

1. **Maximum times:** the proposal said no importing module would need to change, but five sites turn a maximum time into a timeout and a `null` would have become 0 ms. Fixed with `phaseTimeoutMs` (design Decision 3).
2. **Provider bindings:** image and video scenes were bound to the model and the endpoint path, so changing either setting would have left bound scenes without an adapter. The product owner chose to bind by provider name; the one legacy value earlier builds wrote still resolves (design Decisions 6 and 7).
3. **Alignment endpoint:** `alignment.endpoint` was never used; the adapter now builds its URL from it.

## 5.2 Scenario and acceptance-criterion coverage

provider-and-parameter-settings
- Fresh install, no override: settings.test "returns the defaults when no override file exists"; providers-settings "With no override file"; server-runtime-load "starts and listens when there is no override file"
- Partial override: settings.test "replaces only the keys a partial override sets"; providers-settings "exports the configured request cap and maximum time"
- Admitted durations drive segmentation and clip requests: settings-behaviour "requests 10 s ... 6-10 s", "accepts the same script when the configured lower bound is 3 s"
- Provider with no adapter: settings.test "rejects a provider the stage has no adapter for"
- Changed model identifier: provider-requests "reasoning provider is sent the configured model" (+ image model: provider-binding "sends a scene ... to the new model")
- Edit while running: providers-settings "ignores an edit to the override file made while the app is running" + "offers no route to read or change the settings"
- Lower bound below minimum: settings.test case "segmentation lower bound below the admitted minimum"
- Several problems at once: settings.test "lists every problem ..."; providers-settings "throws one error that lists every problem"; server-runtime-load "exits non-zero before listening"
- Unreadable override: settings.test "reports an override that is not JSON ..."; providers-settings "names the override file when it is not valid JSON"
- API key in override: settings.test "rejects a credential-like key ..."; providers-settings; server-runtime-load
- Admitted durations change after chunks exist: settings-behaviour "keeps each chunk's requested duration, speed factor and warnings"
- Language removed while a session uses it: settings-behaviour "still serves an existing Spanish session ..." and "does not consult the supported-language list"
- Image model changes while scenes are bound: provider-binding (it.each bound by name / earlier build)
- Bound provider the build does not ship: provider-binding "still fails a scene bound to a provider name the build does not ship"; image-stage "a bound provider with no adapter ... fails not-retryable"
clip-duration-request
- 3 existing scenarios: admitted-durations.test, scene-registration tests (unchanged, pass on the defaults)
- Configured admitted durations: settings-behaviour "requests 10 s for a 12.3 s interval"
stage-execution-time-limit
- Undetermined limit: settings-behaviour "gives an attempt of a null-limit stage no deadline", adapters "no timeout", video-time-limit "never fails a clip ... no maximum time"
- Sent attempt never answers / fourth attempt / each stage its own: attempt-timeout, attempt-deadline, image/video-time-limit (existing, pass on defaults) + settings-behaviour "uses a configured maximum time as the deadline, and each stage its own"
JOS-174 ACs
- AC1 one provider per stage: settings.test (provider names), provider-requests, provider-binding
- AC2 admitted durations used by segmentation and clip requests: settings-behaviour, providers-settings "derives the admitted durations ..."
- AC3 operational values applied (without the Administrator password): providers-settings "exports the configured ..." (4 tests), provider-requests (voice, alignment, video, reasoning), settings.test field rules
- AC4 edited in files, effective after restart, not on /admin: providers-settings "Settings are read once, at start-up" (2 tests)
- AC5 missing/empty/inconsistent stops start-up listing every problem: settings.test (field rules, missing key), server-runtime-load invalid override

The Administrator password half of AC3, and of AC5's example "no Administrator password", is deferred by the product owner (2026-10-19) to the story that adds `/admin`.
