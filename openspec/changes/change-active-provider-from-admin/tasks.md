# Tasks — Change the active provider from /admin (JOS-171)

## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create branch `feature/jos-171-change-active-provider` from `origin/feature/entrega-2-JAME` (the MVP integration branch) with `--no-track`, in the worktree `../AI4Devs-jos-171`
- [x] 0.2 Verify the branch was created and is the current branch of that worktree

## 1. Gate

- [ ] 1.1 `git fetch`. Confirm JOS-173 (`/admin` + Administrator gate) and JOS-174 (settings files) are merged into `origin/feature/entrega-2-JAME`, then rebase this branch onto it. If either is missing, stop.
- [ ] 1.2 Confirm the base still matches design.md § Context: the five bind points, the registry shapes and keys, the attempt `providerId` values, how JOS-173 exposes Administrator access to routes and to the `/admin` page, and how JOS-174 exposes each stage's provider name. Update design.md first if anything differs.
- [ ] 1.3 Draft the next PRD version (§2.1, §2.3, §11.2, §16, plus the exception to JOS-174's "files only" rule for the active provider) and mark it as awaiting the product owner's approval, before any code.

## 2. Backend: storage (TDD; design Decisions 2, 3)

- [ ] 2.1 Write failing migration tests: `active_providers` exists; `runs.decomposition_provider_id` and `runs.alignment_provider_id` exist; a pre-migration run with decomposition and alignment attempts is backfilled from its earliest attempt of each stage; `elevenlabs-native` attempts do not backfill alignment; a run with no attempts stays `NULL`.
- [ ] 2.2 Add the migration. Make 2.1 pass.
- [ ] 2.3 Write failing tests for `bindDecompositionProvider` and `bindAlignmentProvider`: the first call binds and returns `true`, and a second call with another id changes nothing. Then implement them, following `bindVoiceProvider`.

## 3. Backend: registries and `activeProviderId` (TDD; design Decisions 1, 2)

- [ ] 3.1 Add registries for reasoning and alignment with get/set seams, matching the voice registry. Give every registry entry a `label` and remove `defaultIdentifier`. Keep today's adapter ids.
- [ ] 3.2 Write failing tests for `activeProviderId(stage)`:
  - with no row, it is the settings default resolved by label;
  - with a row naming a shipped adapter, it is that adapter;
  - with a row naming an adapter that is not shipped, it is the settings default, a warning is logged once, and nothing throws;
  - a write is visible to the next call with no restart.
- [ ] 3.3 Implement `activeProviderId` and `setActiveProvider(stage, providerId)` (upsert with `changed_at`). Make 3.2 pass.

## 4. Backend: bind points use the active provider (TDD; spec scenarios)

- [ ] 4.1 Write failing tests with stub adapters `stub-a` and `stub-b` per stage:
  - for each of the five stages, after `setActiveProvider(stage, "stub-b")` the next first attempt binds to `stub-b` and is sent there (AC1);
  - a session or scene bound to `stub-a` keeps sending automatic retries to `stub-a` after the change, and so does a manual retry of an exhausted failure (AC3);
  - completed voice-over, timestamps, images and clips get no new request after a change (AC4);
  - an exhausted cycle stays bound to `stub-a` and sends nothing to `stub-b` (AC5);
  - two concurrent first attempts across a change both use the single stored binding;
  - native timestamps bind no alignment provider.
- [ ] 4.2 Replace `registry.defaultIdentifier` with `activeProviderId(stage)` at the voice, image and video bind points. Add binding at the first decomposition and alignment attempts, so that their retries read the binding. Make 4.1 pass.
- [ ] 4.3 After a restart, a `stub-b` choice still applies to new binds and an existing `stub-a` binding still applies to its retries.

## 5. Backend: admin API (TDD; design Decision 5)

- [ ] 5.1 Write failing route tests:
  - `GET /admin/providers` returns five stages with `activeProviderId`, `activeLabel`, `source`, `selectable` and `orphanedChoice`;
  - `PUT /admin/providers/video` with `stub-b` returns 200 and the new view;
  - an unknown stage, or a provider that is not selectable, returns 400 with the selectable ids and leaves the active provider unchanged;
  - both routes return 401 without Administrator access and write nothing (AC2).
- [ ] 5.2 Implement the routes with zod schemas behind JOS-173's gate. Make 5.1 pass, and confirm they appear in the generated OpenAPI document.

## 6. Frontend: "Active providers" section on /admin (TDD; design Decision 6)

- [ ] 6.1 Write failing component tests:
  - one row per stage with its select set to the active provider and its source hint;
  - a single-option stage shows a disabled select;
  - changing a select sends the `PUT` and shows the returned view;
  - a 400 or 401 shows an error and keeps the previous value.
- [ ] 6.2 Add the client calls and the section inside JOS-173's `/admin` page. Make 6.1 pass.

## 7. Review and Update Existing Unit Tests (MANDATORY)

- [ ] 7.1 Review the tests that build registries or rely on `defaultIdentifier`: `voice-over-*`, `image-stage`, `video-stage`, `decomposition-*`, `narration-timestamps-*`, `retry-scheduler`, `restart-*`, `orchestrator`, and the server stub wiring. Update them for the new registry shape.
- [ ] 7.2 Map every scenario in `specs/active-provider-selection/spec.md` and JOS-171 AC1–AC5 to at least one test. List the mapping in the step 8 report.
- [ ] 7.3 Confirm module test coverage has not decreased (compare against this change's propose commit).

## 8. Run Unit Tests and Verify Database State (MANDATORY)

- [ ] 8.1 Capture the pre-test baseline of the default store: row counts per table (including `active_providers`), the binding columns' non-null counts, applied migrations, and `data/projects/` contents.
- [ ] 8.2 Run the targeted tests from groups 2–6.
- [ ] 8.3 Run `npm run typecheck` and the full `npm test` in both `backend` and `frontend`, with no `backend/.secrets.json` and no settings override in the checkout.
- [ ] 8.4 Verify the post-test state matches the baseline; restore it if not.
- [ ] 8.5 Create the report `openspec/changes/change-active-provider-from-admin/reports/YYYY-MM-DD-step-8-unit-test-and-db-verification.md`.
- [ ] 8.6 Mark this step complete only after the tests pass and the report file exists.

## 9. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [ ] 9.1 Start the real server on a scratch store and scratch projects folder, with two stub adapters per stage registered through the test seams, and `ALLOW_TEST_ENDPOINTS=1`.
- [ ] 9.2 Call `GET /admin/providers` and `PUT /admin/providers/video` without Administrator access: both return 401 and the store is unchanged.
- [ ] 9.3 With Administrator access: `GET` shows every stage from the settings. `PUT /admin/providers/video {"providerId":"stub-b"}` returns 200 and `source: "admin"`. An unknown stage or provider returns 400.
- [ ] 9.4 Start session A before the change and session B after it. In `GET /sessions/:id` and the attempt rows, A's video stages are on `stub-a` (including a forced transient-failure retry) and B's are on `stub-b`. Restart: the choice holds.
- [ ] 9.5 Delete the created sessions, the `active_providers` rows and the scratch store and folder. Confirm the default store is untouched. Save `openspec/changes/change-active-provider-from-admin/reports/YYYY-MM-DD-step-9-manual-endpoint-testing.md`.

## 10. E2E Testing with Playwright MCP (MANDATORY if applicable - AGENT MUST EXECUTE)

- [ ] 10.1 Applicability: a new `/admin` section, so this step applies.
- [ ] 10.2 Run the backend (scratch store, two stub adapters per stage) and the frontend. Open `/admin` without the password: no provider change is possible. Enter the password: five rows, each from the settings files. Change video to `stub-b`: the row shows "set on /admin". Reload: it persists.
- [ ] 10.3 Start a session and confirm in its scene diagnostics that the clips use `stub-b`, while a session started before the change stays on `stub-a`.
- [ ] 10.4 Restore the environment and save `openspec/changes/change-active-provider-from-admin/reports/YYYY-MM-DD-step-10-e2e.md`.

## 11. Update Technical Documentation (MANDATORY)

- [ ] 11.1 `docs/PRD.md`: the next version (keep the previous one as `docs/PRD-v<prev>.md`) with §2.1, §2.3 and §11.2 changed, and a §16 change log entry.
- [ ] 11.2 `docs/api-spec.yml`: `GET /admin/providers` and `PUT /admin/providers/{stage}`, with 200, 400 and 401.
- [ ] 11.3 `docs/data-model.md`: `active_providers`, `runs.decomposition_provider_id`, `runs.alignment_provider_id`, and the binding rule for all five stages.
- [ ] 11.4 `docs/backend-standards.md`: bind points use `activeProviderId(stage)` and never read the active provider for an instance that is already bound.
- [ ] 11.5 `docs/development_guide.md`: how the `/admin` choice relates to the settings files, and how to register stub adapters for testing.
- [ ] 11.6 Create the follow-up Linear ticket "Add and verify a second real provider" (assignee jose.elguezabal@gmail.com, label `type:feature`), including the per-provider parameters open question. Link it to JOS-171.
- [ ] 11.7 Run `graphify update .`.
