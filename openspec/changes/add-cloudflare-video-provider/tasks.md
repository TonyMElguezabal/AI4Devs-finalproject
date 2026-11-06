## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create feature branch `feature/jos-219-cloudflare-video-provider` from `origin/feature/entrega-3-JAME` in its own worktree (`--no-track`)
- [x] 0.2 Verify the current branch and that it has no upstream

## 1. Verify Cloudflare against the live vendor (spike, design Decision 1)

- [ ] 1.1 Get from the owner a Cloudflare account id and an API token with the Workers AI permission, with Unified Billing credits loaded; keep the token out of every file, log and report
- [ ] 1.2 Write `scripts/spike.ts` in the change folder; send one 768P 4-second text-only request and record whether `ai/run` answers at once (`queued`/`running`) or blocks until `succeeded`, and how long it takes
- [ ] 1.3 Find and confirm the request that reads a task by its id with no webhook (including `options.background: true`); record its answers for `queued`, `running`, `succeeded`, an unknown id, and a task several minutes old
- [ ] 1.4 Send one 2K image-to-video request with a real scene PNG (2560×1440) as a `data:` URI with role `first_frame`; record whether it is accepted, the largest accepted body, and JPEG as a fallback
- [ ] 1.5 Record the HTTP status and body for a bad token, a token without Workers AI permission, a bad model, duration 3, an oversized prompt, and a 429 if one can be observed; record rate-limit headers
- [ ] 1.6 Record how long `content.url` can be downloaded, the `usage` fields and the account charge of one 2K clip; check `user/tokens/verify` against `accounts/{id}/tokens/verify` for the token type
- [ ] 1.7 Write `reports/YYYY-MM-DD-step-1-cloudflare-spike.md` (requests and answers, token removed; keep one clip from each vendor for the same scene)
- [ ] 1.8 Apply the stop rule: if no way to follow a task by a stored id, or no way to send a local image, stop here and ask the owner how to re-plan
- [ ] 1.9 Update `design.md` (Context table, Decisions 2, 4, 7, Open Questions) and `specs/cloudflare-video-adapter/spec.md` with the confirmed request shapes, replacing every "the way the verification spike confirms"; run `openspec validate add-cloudflare-video-provider`

## 2. Backend tests first (TDD)

- [ ] 2.1 Adapter tests against a stubbed `fetch`: the submit request (URL with the account id, bearer token, model, text item, first-frame item, duration, `2K`); the flat `sentBody` with no image data and no token; `poll` maps `queued`/`running`, `succeeded` with and without URL, `failed` with `error.code`, `cancelled`, unknown id
- [ ] 2.2 Add `cloudflare-video` fixtures to `adapter-contract.test.ts` (401 not retryable, 503 and 429 transient, network failure unresponsive, malformed body defined); one request per case
- [ ] 2.3 Parameter tests: `accountId` must be 32 lowercase hex (a URL or a short value is refused on `accountId`); `model` uses the model-id rule; the duration range is checked
- [ ] 2.4 Registry test: a RunningHub and a Cloudflare profile in the video stage each resolve to their own adapter and their own key; a bound retry stays on its vendor's host
- [ ] 2.5 Admin test: a Cloudflare profile with shortest clip 8 is refused with the segmentation-bound problem
- [ ] 2.6 Connection-check tests: active token connected, 401/403 and inactive token key rejected, network failure unreachable, other status unexpected; `covers` says only the token was checked
- [ ] 2.7 Diagnostics test: a Cloudflare clip's scene details show the profile's label and its `model` parameter

## 3. Backend implementation

- [ ] 3.1 `providerTypes.ts`: `PARAMETER_SHAPES`, `ADAPTER_VENDORS` ("Cloudflare") and the `/admin` form fields for `cloudflare-video` (Decision 4)
- [ ] 3.2 `videoProvider.ts`: `createCloudflareVideoProvider` (Decisions 2, 3) and the `VIDEO_ADAPTERS` table used by `defaultRegistry()` (Decision 5)
- [ ] 3.3 `providerConnectionCheck.ts`: the token check (Decision 7)
- [ ] 3.4 `providerAdmin.ts`: the duration rule for every video adapter type; `stageDiagnostics.ts`: the video model from the profile's parameters (Decision 6)

## 4. Review and Update Existing Unit Tests (MANDATORY)

- [ ] 4.1 Review the provider-types and provider-profiles route tests, `adapters-no-hidden-retries`, the per-adapter table tests and the API surface tests for assumptions of one video type; update them

## 5. Run Unit Tests and Verify Database State (MANDATORY)

- [ ] 5.1 Capture the pre-test database baseline (scratch `DB_PATH` and `PROJECTS_ROOT`, never `backend/data`)
- [ ] 5.2 Run the targeted tests for the adapter, registry, admin, connection-check and diagnostics changes
- [ ] 5.3 Run `npm run typecheck`, `npm run lint` and `npm test` in `backend` and `frontend`
- [ ] 5.4 Verify post-test database state and restore if needed
- [ ] 5.5 Create report `reports/YYYY-MM-DD-step-5-unit-test-and-db-verification.md`
- [ ] 5.6 Mark the step complete only after tests pass and the report exists

## 6. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [ ] 6.1 Start the backend with a scratch data folder and the Administrator password; `GET /admin/provider-types` lists `cloudflare-video` with its fields
- [ ] 6.2 `POST /admin/provider-profiles` a Cloudflare profile (valid, then with a bad `accountId` and with shortest clip 8); test its connection with the real token and a wrong one; make it active with `PUT /admin/providers/video`
- [ ] 6.3 Restore the scratch database (delete the profile, RunningHub active again) and document commands and responses (token redacted) in `reports/YYYY-MM-DD-step-6-curl-endpoint-testing.md`

## 7. Live run and E2E with Playwright MCP (MANDATORY - AGENT MUST EXECUTE)

- [ ] 7.1 On `/admin`, add a Cloudflare profile through the form, test its connection, and make it active
- [ ] 7.2 Run a short session (two or three scenes) to its final video with Cloudflare active; check each clip passed the MP4 checks, the scene details name the Cloudflare profile and `minimax/h3`, and the clip request status shows no image data
- [ ] 7.3 Restart the backend while one Cloudflare clip is in progress; check it is followed by its stored id and not requested again
- [ ] 7.4 Make RunningHub active again; record the run, cost and screenshots in `reports/YYYY-MM-DD-step-7-live-run-and-e2e.md`

## 8. Update Technical Documentation (MANDATORY)

- [ ] 8.1 Update the PRD (new version, previous kept): §11.2 and §11.3 name Cloudflare Workers AI as a second video vendor, its parameters, its key and its check
- [ ] 8.2 Update `docs/api-spec.yml` (the `cloudflare-video` type in the provider-types and profile examples)
- [ ] 8.3 Update `docs/backend-standards.md` (provider profiles section: a video adapter type needs an entry in `VIDEO_ADAPTERS`) and the backend README
- [ ] 8.4 Post the result on JOS-219 and run `graphify update .`
- [ ] 8.5 Open the pull request into `feature/entrega-3-JAME` linking JOS-219; archive the change after merge
