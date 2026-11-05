## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create branch `feature/jos-263-shared-adapter-contract-suite` from `origin/feature/entrega-3-JAME` (`34ef3cc9`, with JOS-262 merged) with `--no-track`
- [x] 0.2 Verify the branch was created and is the current branch

## 1. Backend: The shared contract suite (TDD; design Decisions 1-3)

- [ ] 1.1 Write `backend/test/adapter-contract.test.ts` with the `ContractOperation` and `AdapterContractFixture` types, a single `classify(result)` function, and the answer table of Decision 2 (valid answer; 400, 401, 402, 403, 404, 413, 422; 408, 429, 500, 502, 503, 504; refused connection; timeout; malformed 200). Every case counts requests
- [ ] 1.2 Add the meta-test of Decision 3, and type the fixtures `Record<AdapterTypeId, AdapterContractFixture>`, starting empty
- [ ] 1.3 Confirm the change fails first: `npm run typecheck` names the five missing adapter types, and the meta-test fails (record the output)
- [ ] 1.4 Add the fixtures, one per adapter type, from the Context table. Reuse the success bodies of the per-adapter tests: `openai-reasoning` `generate`; `elevenlabs-voice` `synthesize`; `elevenlabs-alignment` `align`; `fal-image` `submit`; `runninghub-video` `submit` (two requests on success) and `poll`
- [ ] 1.5 Run the suite on scratch `DB_PATH` and `PROJECTS_ROOT`. If any adapter disagrees with the table, stop: it is either a fixture error or a real gap, and a real gap needs an artifact update and the product owner, not a code fix in this story

## 2. Backend: Prove the meta-test by hand (design Decision 3)

- [ ] 2.1 Add a scratch key to `PARAMETER_SHAPES` (with stub entries in the three JOS-262 tables, so only this suite is missing it), run `npm run typecheck` and the suite, and record that both name the key
- [ ] 2.2 Revert, and confirm `git diff -- backend/src` is empty

## 3. Backend: Review and Update Existing Unit Tests (MANDATORY; design Decision 4)

- [ ] 3.1 List, per file, every case the suite now repeats exactly (same adapter, operation, answer and classification): `voice-provider`, `alignment-provider`, `visual-instructions`, `image-provider`, `image-provider-queue`, `video-provider` and the six adapter cases of `adapters-no-hidden-retries`
- [ ] 3.2 Remove only those cases. Keep every vendor-specific case listed in Decision 4, and keep the script moderation case. Remove imports and helpers that are left unused
- [ ] 3.3 Record the case lists before and after, and the suite case that replaces each removed one

## 4. Backend: Run Unit Tests and Verify Database State (MANDATORY)

- [ ] 4.1 Capture the pre-test baseline of `backend/data/` (`skeleton.sqlite` profile and run counts with checksum, `store.sqlite` checksum, `projects/` entries)
- [ ] 4.2 Run the targeted tests (the suite and the seven trimmed files) with a scratch `DB_PATH`, `PROJECTS_ROOT` and an empty `SECRETS_PATH`
- [ ] 4.3 Run the full backend suite the same way, plus `npm run typecheck` and `npm run lint`
- [ ] 4.4 Verify the post-test state of `backend/data/` matches 4.1, and restore it if it does not
- [ ] 4.5 Create report `openspec/changes/shared-adapter-contract-suite/reports/YYYY-MM-DD-step-4-unit-test-and-db-verification.md`, including the case mapping of 3.3
- [ ] 4.6 Mark step complete only after tests pass and the report exists

## 5. Backend: Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [ ] 5.1 Confirm `git diff --stat origin/feature/entrega-3-JAME -- backend/src frontend` is empty. No production code changed, so no endpoint can answer differently
- [ ] 5.2 Start the backend on a scratch store with literal env vars and check `GET /health` and `GET /admin/provider-types` answer 200, so the branch runs. Stop it
- [ ] 5.3 Record 5.1 and 5.2 in `openspec/changes/shared-adapter-contract-suite/reports/YYYY-MM-DD-step-5-manual-endpoint-testing.md`

## 6. Frontend: E2E Testing with Playwright MCP (MANDATORY if applicable - AGENT MUST EXECUTE)

- [ ] 6.1 Not applicable: no frontend or backend runtime code changes (5.1). Record this in the step 5 report

## 7. Update Technical Documentation (MANDATORY)

- [ ] 7.1 Add to `docs/backend-standards.md` § Provider adapters: a new adapter type must add a fixture to `test/adapter-contract.test.ts`, and the shared table is the one place its status classification is tested
- [ ] 7.2 Confirm `docs/api-spec.yml` and `docs/data-model.md` need no change
- [ ] 7.3 Run `graphify update .`

## 8. Delivery

- [ ] 8.1 Commit on the feature branch
- [ ] 8.2 Ask before pushing. Open a PR into `feature/entrega-3-JAME` that explains the architectural motivation, lists the removed cases with their replacements, and proposes the `classifyHttpStatus` extraction as a follow-up
