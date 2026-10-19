# Tasks — Configure providers and parameters in configuration files (JOS-174)

## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create branch `feature/jos-174-configure-providers` from `origin/feature/entrega-2-JAME` (the MVP integration branch) with `--no-track`, in the worktree `../AI4Devs-jos-174`
- [x] 0.2 Verify the branch was created and is the current branch of that worktree

## 1. Gate

- [x] 1.1 `git fetch`. Confirm the base still matches design.md § Context: `providers.ts` exports the values listed in Decision 3, and `routes.ts` builds the request `language` enum from `SUPPORTED_LANGUAGE_CODES` while the response field is `z.string()`. If JOS-194 has merged and moved `DB_PATH` to the OS application-data folder, place the override path next to it (Decision 1), and update design.md first.
- [x] 1.2 PRD v1.10 draft (§2.1, §2.3, §11, §11.2, §11.3, §16) written and marked as awaiting the product owner's approval, before any code.

## 2. Backend: settings loader and schema (TDD; design Decisions 1, 2, 4, 5)

- [x] 2.1 Write failing tests in `backend/test/settings.test.ts` for `loadSettings({ defaultsPath, overridePath })`, using scratch files:
  - no override file → `ok: true` with the defaults;
  - a partial override replaces only its keys, and an override array replaces the default array whole;
  - a non-JSON override → one problem naming its path;
  - a provider name with no adapter for that stage → a problem naming the setting and the accepted names;
  - lower bound below the admitted minimum, min > max, an empty language list, duplicate language codes, an odd output width, a request cap of 0, a voice speed of 1.5 → each reported with its dotted path;
  - several problems at once → all are listed;
  - a missing `maxTimeSeconds.<stage>` key is a problem, while `null` is accepted as "not timed";
  - an unknown key such as `openaiApiKey` with a secret value → a problem naming the key, and the value appears nowhere in the output.
- [x] 2.2 Implement `backend/src/config/settings.ts`: the strict zod schema, the cross-field `superRefine`, the merge, and issue formatting without received values. Make 2.1 pass.
- [x] 2.3 Create `backend/config/settings.default.json` holding exactly today's `providers.ts` values for every AC3 setting (`maxTimeSeconds.assembly: null`). Add a test that the shipped defaults file loads with `ok: true` and matches today's literals.

## 3. Backend: `providers.ts` reads the settings (TDD; design Decision 3)

- [x] 3.1 Write failing tests: with `SETTINGS_PATH` pointing to an override that changes the video cap, a maximum time, the admitted range plus lower bound, and the languages, a fresh import of `providers.ts` (`vi.resetModules`) exports those values. `VIDEO_ADMITTED_DURATIONS_SECONDS` and `SEGMENTATION_UPPER_BOUND_SECONDS` follow the configured range.
- [x] 3.2 Change `providers.ts` to load the settings at module load and derive the AC3 exports from them. Keep values outside AC3 as literals. Map a `null` maximum time to `"undetermined"`, add `phaseTimeoutMs(stage)`, and use it at the five places that multiply a maximum time (design Decision 3). Throw one `Error` listing every problem when loading fails. Widen `SupportedLanguageCode` to `string` and fix `routes.ts`'s `z.enum`. Pin `SETTINGS_PATH` to a missing file in `vitest.config.ts`, so a local override cannot change a test's outcome. Make 3.1 pass with `npm run typecheck` clean.
- [x] 3.3 Extend `backend/test/server-runtime-load.test.ts`: a real `node src/server.ts` with an invalid override exits non-zero before listening, and stderr lists every problem. With no override, it still starts.

## 4. Backend: behaviour follows the settings, established work does not change (TDD; spec scenarios)

- [x] 4.1 Clip duration with admitted durations of 6–10 s: a 12.3 s interval requests 10 s (spec `clip-duration-request`, "Configured admitted durations"). Segmentation uses the configured lower bound.
- [x] 4.2 A stage whose `maxTimeSeconds` is `null` is never timed out: `phaseTimeoutMs` returns `undefined`, each adapter sends its request with no timeout, and `attemptDeadline` gives no deadline. A configured value is the deadline (spec `stage-execution-time-limit`).
- [x] 4.3 Restart with different admitted durations: an existing session's chunks keep their requested durations, speed factors and warnings. Restart with Spanish removed: an existing Spanish session can still be read, continued and retried, and `POST /sessions` with `es` is rejected with 400.
- [x] 4.4 The configured model identifiers, endpoints and voice settings reach the provider request (adapter tests with a fake `fetch`): reasoning model, voice id, model, output format and speed, image model, alignment endpoint (the adapter builds its URL from `ALIGNMENT_PROVIDER.endpoint`), video endpoint.
- [x] 4.5 Bind image and video scenes by provider name (design Decision 7), tests first: a new scene is bound to `Fal.ai` / `RunningHub`; a scene bound by an earlier build (`fal-ai/flux/dev`, the old endpoint path) still resolves to the same adapter; after the model is changed, a retry of a bound scene is sent with the new model; a bound name with no adapter still fails as not retryable. Update the stage diagnostics map to show the name-bound providers.

## 5. Review and Update Existing Unit Tests (MANDATORY)

- [x] 5.1 Review the tests that import `providers.ts` values or assume the `"en" | "es"` type: `segmentation`, `admitted-durations`, `concurrency`, `attempt-timeout`, `routes`/`sessions`, `voice-over-*`, `languages`. Update any that relied on a literal that is now configured.
- [x] 5.2 Map every scenario in `specs/provider-and-parameter-settings/spec.md`, `specs/clip-duration-request/spec.md` and `specs/stage-execution-time-limit/spec.md`, and JOS-174 AC1–AC5 (AC3 without the Administrator password, which is deferred), to at least one test. List the mapping in the step 6 report.
- [x] 5.3 Confirm module test coverage has not decreased (compare against this change's propose commit).

## 6. Run Unit Tests and Verify Database State (MANDATORY)

- [x] 6.1 Capture the pre-test baseline of the default store: row counts per table, applied migrations, `data/projects/` contents, and whether `data/settings.json` exists.
- [x] 6.2 Run the targeted tests from 2–4.
- [x] 6.3 Run `npm run typecheck` and the full `npm test` in both `backend` and `frontend`, with no `backend/.secrets.json` and no `backend/data/settings.json` in the checkout.
- [x] 6.4 Verify the post-test state matches the baseline; restore it if not.
- [x] 6.5 Create the report `openspec/changes/configure-providers-and-parameters/reports/YYYY-MM-DD-step-6-unit-test-and-db-verification.md`.
- [x] 6.6 Mark this step complete only after the tests pass and the report file exists.

## 7. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 7.1 Start the real server on a scratch store and scratch projects folder with stub providers and no override. Confirm `GET /health`, and that the languages endpoint returns English and Spanish.
- [x] 7.2 Restart with a scratch override (`SETTINGS_PATH`) that removes Spanish and lowers the video cap to 1. The languages endpoint returns English only. `POST /sessions` with `es` returns 400, and with `en` returns 201. The boot log shows video `limit: 1`.
- [x] 7.3 Restart with an override holding three problems (a lower bound below the minimum, an unknown `openaiApiKey` with a fake value, an empty language list). The server does not start, all three are printed, and the fake value is not.
- [x] 7.4 Edit the override while the server runs; confirm nothing changes until restart.
- [x] 7.5 Delete the created sessions and the scratch store, folder and override. Confirm the default store is untouched. Save `openspec/changes/configure-providers-and-parameters/reports/YYYY-MM-DD-step-7-manual-endpoint-testing.md`.

## 8. E2E Testing with Playwright MCP (MANDATORY if applicable - AGENT MUST EXECUTE)

- [x] 8.1 Applicability: no frontend code changes, but the new-session language selector reads the configured list, so this step applies.
- [x] 8.2 Run the backend (scratch store, override with English only) and the frontend. The new-session form offers English only. Restart with no override: it offers English and Spanish.
- [x] 8.3 Restore the environment and save `openspec/changes/configure-providers-and-parameters/reports/YYYY-MM-DD-step-8-e2e.md`.

## 9. Update Technical Documentation (MANDATORY)

- [x] 9.1 `docs/PRD.md` → v1.10 (keep v1.9 as `docs/PRD-v1.9.md`): §2.1 and §2.3 no longer exclude configuration files; §11 states the values come from local settings files and apply after a restart; §11.3's values are the shipped defaults; §16 change log entry. The Administrator password stays deferred with `/admin`.
- [x] 9.2 `docs/backend-standards.md` "Constants": AC3 values come from `backend/config/settings.default.json` plus the override, read through `providers.ts`. Values outside AC3 stay literals in `providers.ts`.
- [x] 9.3 `docs/development_guide.md`: where the two files live, every key with its rule (design Decision 5), "restart to apply", the start-up error list, and that credentials never go in these files.
- [x] 9.4 `docs/api-spec.yml`: the `language` request enum is the configured list (English and Spanish by default).
- [x] 9.5 `docs/adr/0005-provider-selection.md`: add a note that its values are now the shipped defaults in `settings.default.json`.
- [x] 9.6 Comment on JOS-174 with the deferral of the Administrator password, and confirm the `/admin` story's acceptance criteria include it.
- [x] 9.7 Run `graphify update .`.
