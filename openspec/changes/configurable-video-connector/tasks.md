## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create feature branch `feature/jos-219-configurable-video-connector` from `origin/feature/entrega-3-JAME` in its own worktree (`--no-track`)
- [x] 0.2 Verify the current branch and that it has no upstream

## 1. Confirm the two vendors live (design Open Questions)

- [x] 1.1 Get a Runway API key from the owner (with credits); use the existing RunningHub key; keep every key out of files, logs and reports
- [x] 1.2 With curl, send one Runway `wan3` and one `kling_4` image-to-video request (4–5 s, `auto_720p` to keep it cheap, a real scene PNG as a data URI); record the task-id field, the poll answers (including `THROTTLED` if seen), an unknown task id, the `output` link and the charge
- [x] 1.3 Find a free Runway request that proves the key (for the check step); record its answers for a good and a wrong key
- [x] 1.4 Record Runway's answers for a 400 (bad ratio on Kling, an unknown field on Kling) and a 401
- [x] 1.5 Write both definitions in `docs/video-connector-definitions.md` from what passed, and the run in `reports/YYYY-MM-DD-step-1-live-vendors.md` (keys removed); update the design's Decision 1 values if they differ

## 2. Backend tests first (TDD)

- [x] 2.1 Definition validation: base URL rules (https, host only), steps with paths not URLs, required paths, unknown placeholders, `{image_url}` without upload, `{task_id}` outside poll, `{key}` outside headers; every problem listed with its path
- [x] 2.2 Template filling: a whole-string placeholder is typed (`duration` as a number); embedded placeholders are text and URL-encoded in paths; no field is added; `{image_data_uri}` and `{image_base64}` are the scene image
- [x] 2.3 Connector against a stubbed `fetch`, with both doc definitions as fixtures: upload then submit; task id at `taskIdAt`; `sentBody` holds only prompt, duration, resolution; poll maps `doneWhen` with and without URL, `failedWhen`, other statuses, not-found status; `errorAt` against `okErrorValues`
- [x] 2.4 Add `configured-video` fixtures (Runway and RunningHub definitions) to `adapter-contract.test.ts`; one request per failure case
- [x] 2.5 Registry: a coded RunningHub profile and a Runway connector profile each resolve to their own adapter, host and key; a bound retry stays on its host
- [x] 2.6 Admin: shortest clip 8 refused for a connector profile; a host change clears the key and says so; `copyKeyFrom` copies for the same host and is refused for another host or type; the key is never in a response
- [x] 2.7 Connection check: the definition's check step (connected, 401/403 key rejected, unreachable, unexpected); no check step sends nothing; a charged check needs confirmation
- [x] 2.8 Telemetry vendor is the base URL host; scene details show the label and `model`; a restart while a connector clip is pending polls it and does not resubmit
- [x] 2.9 Resolution cap (Decision 9): `output` accepts only 1280×720 and 1920×1080 and refuses 2560×1440 at start-up; RunningHub accepts only `768P`, a stored profile without `resolution` submits `768P`, and `sentBody.resolution` is `768P`; a connector resolution of `2K`, `auto_1440p` or `4K` is refused on `resolution`, and `auto_720p` and `768P` are accepted

## 3. Backend implementation

- [x] 3.1 `providerTypes.ts`: the `configured-video` parameter schema with its definition rules, vendor "Configured connector", the form fields and the `json` field kind (Decisions 1, 2, 5, 8)
- [x] 3.2 `videoConnector.ts`: templates, path reading (reusing the `bodyField` reducer, moved to a shared helper), upload, submit, poll and classification (Decisions 2–4)
- [x] 3.3 `videoProvider.ts`: the `VIDEO_ADAPTERS` table used by `defaultRegistry()` (Decision 7)
- [x] 3.4 `providerAdmin.ts` and the profile routes: the duration rule for every video type, the key cleared on a host change, `copyKeyFrom` (Decisions 5, 6)
- [x] 3.5 `providerConnectionCheck.ts`: the definition's check step; `db.ts`: the telemetry vendor; `stageDiagnostics.ts`: the model (Decision 7)
- [x] 3.6 `config/settings.ts`: the two output sizes; `providerTypes.ts`: RunningHub's `resolution` with default `768P` and the connector's resolution check; `videoProvider.ts`: read the profile's resolution; remove `VIDEO_GENERATION_SETTING` (Decision 9)

## 4. Frontend tests first, then implementation

- [x] 4.1 Test `ProviderProfilesSection`: the `json` field (a parse error is shown before saving; server problems show under the field with their path); "Duplicate" prefills the add form without the key and offers to reuse it; the host-change warning shows before saving
- [x] 4.2 Implement the `json` field kind, "Duplicate" with `copyKeyFrom`, and the warning; add `copyKeyFrom` to the API client

## 5. Review and Update Existing Unit Tests (MANDATORY)

- [x] 5.1 Review the provider-types and provider-profiles route tests, `adapters-no-hidden-retries`, the per-adapter table tests, the telemetry vendor tests and the API surface tests for assumptions of one video type; update them

## 6. Run Unit Tests and Verify Database State (MANDATORY)

- [x] 6.1 Capture the pre-test database baseline (scratch `DB_PATH` and `PROJECTS_ROOT`, never `backend/data`)
- [x] 6.2 Run the targeted tests for the connector, registry, admin, connection check, telemetry and form
- [x] 6.3 Run `npm run typecheck`, `npm run lint` and `npm test` in `backend` and `frontend`
- [x] 6.4 Verify post-test database state and restore if needed
- [x] 6.5 Create report `reports/YYYY-MM-DD-step-6-unit-test-and-db-verification.md`
- [x] 6.6 Mark the step complete only after tests pass and the report exists

## 7. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [ ] 7.1 Start the backend with a scratch data folder and the Administrator password; `GET /admin/provider-types` lists `configured-video` with its fields
- [ ] 7.2 `POST /admin/provider-profiles` the Runway definition (valid; with `{key}` in the body; with shortest clip 8; with an `http://` base URL); test its connection with the real key and a wrong one; duplicate it for `kling_4` with `copyKeyFrom`; change its host and confirm the key is cleared
- [ ] 7.3 Restore the scratch database (delete the profiles, RunningHub active) and document commands and responses (keys redacted) in `reports/YYYY-MM-DD-step-7-curl-endpoint-testing.md`

## 8. Live proof and E2E with Playwright MCP (MANDATORY - AGENT MUST EXECUTE)

- [ ] 8.1 On `/admin`, add the Runway `wan3` profile from the docs definition through the form, test it, duplicate it for `kling_4`, and add the RunningHub connector profile
- [ ] 8.2 With each connector profile active in turn (Wan, Kling, RunningHub), run a short session (two scenes) to its final video; check the clips pass the MP4 checks, the scene details name the profile and model, and the clip request status shows no image data or key
- [ ] 8.3 Restart the backend while one connector clip is pending; check it is polled by its stored id and not resubmitted
- [ ] 8.4 Make the coded RunningHub profile active again; record the run, the cost and screenshots in `reports/YYYY-MM-DD-step-8-live-proof-and-e2e.md`
- [ ] 8.5 With the pinned ffmpeg (`FFMPEG_PATH`), assemble one session at output 1280×720 and one at 1920×1080 from 768P RunningHub clips; check the sizes with ffprobe and that the subtitles sit in the same place and size relative to the frame (screenshots in the step 8 report)

## 9. Update Technical Documentation (MANDATORY)

- [ ] 9.1 Update the PRD (new version, previous kept): §11.2 and §11.3 describe the configured video connector, the key bound to its host, duplication, and what the connector does not cover; §7.3, §11.3 and D08 state the 720p/1080p output, the 1080p clip cap and RunningHub at 768P, with a note to update RunningHub's price on `/admin`
- [ ] 9.2 Update `docs/api-spec.yml` (the new type, the `json` field kind, `copyKeyFrom`, the key-cleared answer)
- [ ] 9.3 Update `docs/backend-standards.md` (provider profiles: a video adapter type needs an entry in `VIDEO_ADAPTERS`; when a coded adapter is still the right choice) and the backend README
- [ ] 9.4 Update JOS-219 with the new scope and the result, open a follow-up ticket to retire the coded RunningHub adapter, and run `graphify update .`
- [ ] 9.5 Open the pull request into `feature/entrega-3-JAME` linking JOS-219; archive the change after merge
