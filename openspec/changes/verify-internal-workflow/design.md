## Context

The backend can already swap some providers for stubs when it boots. `startServer` (`backend/src/bootstrap.ts`) reads `USE_STUB_VIDEO_PROVIDER`, `USE_STUB_IMAGE_PROVIDER` and `USE_STUB_VOICE_PROVIDER` and installs a stub registry for each. `configureAssemblyTool(env)` (`backend/src/server.ts:152`) does the same for `USE_STUB_ASSEMBLY_TOOL`. Reading the code turned up the gaps that block a free end-to-end run, and a few facts that shape this design:

1. **Three providers have no stub variable.** Decomposition (OpenAI) and alignment (ElevenLabs) are resolved through `getReasoningProviderRegistry` and `getAlignmentProviderRegistry` (`decompositionDependencies.ts`). Script moderation (OpenAI) runs inside `POST /sessions` (`routes.ts:405`) through `getScriptModerator()`. Stubs for all three already exist in `backend/packaging/smokeStubs.ts`, but only the packaged `--smoke` build installs them.
2. **Telemetry names a stub only by its identifier.** `telemetryProviderOf` (`db.ts:1888`) returns `stub` when the identifier starts with `stub-`. `setDecompositionDependencies`, which JOS-247 suggests, swaps the adapter behind the real ids `openai-decomposition` and `elevenlabs-forced-alignment`, so telemetry would still report OpenAI and ElevenLabs.
3. **The stub assembly tool writes nothing.** `createStubAssemblyTool` (`stubAssemblyTool.ts`) returns `{ kind: "success", outputPath }` without creating the file. `GET /sessions/:id/download/final-video` then answers 404 "final video file not found on disk" (`routes.ts:782`).
4. **No stage failure reaches the log file.** A not-retryable stage failure calls `recordError` (`db.ts:1922` for attempts, `db.ts:2407` for image and clip requests). `recordError` (`telemetry/index.ts:110`) only emits an OTLP record, and only with error consent. The pipeline code writes no `error`-level log line. The log file is `logs/vid4you.log` next to `DB_PATH` (`server.ts:53`), and it is written only when `NODE_ENV` is not `test`.
5. **A spawned-server test already exists.** `server-runtime-load.test.ts` runs `node src/server.ts` with `PORT=0`, scratch `DB_PATH`, `PROJECTS_ROOT` and `SETTINGS_PATH`, and `NODE_ENV=development` so that logging is on. `SECRETS_PATH` (`config/credentials.ts:20`) points the key file somewhere else. The update check never runs in a `development` build (`updateCheck.ts:23`).
6. **`POST /sessions` starts the pipeline itself** (`setImmediate(() => launchVoiceOverFor(sessionId))`). A test only has to create the session, poll it, and download the video.

## Goals / Non-Goals

**Goals:**
- A session can run from `POST /sessions` to `final-video` with no provider request and no credentials, configured by environment variables only.
- Two CI tests drive the real `node src/server.ts` process over HTTP: one complete run, and one permanent image failure.
- A permanent stage failure leaves an `error`-level line in the local log file, whatever the telemetry consent.

**Non-Goals:**
- UI journeys, browser automation, real-provider runs, boundary values.
- Stub modes beyond success for decomposition and moderation (failure modes are added when a test needs one).
- Changing what gets reported over OTLP, or when (E16).
- A separate CI job or workflow step.

## Decisions

### D1. Stubs go in as `stub-` registries, not through `setDecompositionDependencies`

A new `configureProviderStubs(env)` in `server.ts`, next to `configureAssemblyTool(env)`, reads `USE_STUB_DECOMPOSITION`. When it is `success`, it calls `setReasoningProviderRegistry({ defaultIdentifier: "stub-reasoning", adapters: { "stub-reasoning": … } })`, and does the same for alignment with `stub-alignment`. This is how the image, video and voice stubs are installed, and the identifiers satisfy JOS-247 AC3 (fact 2). Any other non-empty value is ignored with a warning in the boot log, so a typo doesn't quietly fall back to the paid providers. `startServer` calls it. It takes `env` as a parameter so a unit test can cover the unset case (AC2) without spawning a process.

The session page names a provider through `describeProvider` (`stageDiagnostics.ts`). It knows the three existing stubs by exact identifier and would show `stub-reasoning` and `stub-alignment` as `Unknown provider`. Every stub identifier already starts with `stub-` (`stub-image-provider`, `stub-video-provider`, `stub-voice`), so one prefix rule, checked after the profile lookup, replaces the three entries and covers the new stubs. This is the same rule `telemetryProviderOf` uses. Added on 2026-11-03 at the owner's request.

- *Alternative: `setDecompositionDependencies`* (the ticket's note). Rejected because telemetry would report the real vendors (fact 2).
- *Alternative: one variable per provider* (`USE_STUB_REASONING_PROVIDER`, `USE_STUB_ALIGNMENT_PROVIDER`). Rejected: the two stages always run together in decomposition, and JOS-247 asks for one variable.

### D2. `USE_STUB_SCRIPT_MODERATION=clean` is its own variable

The same function reads it and calls `setScriptModerator` with an always-clean moderator. It is a separate variable because moderation is a different stage (session creation) with its own outcomes (`flagged`, `unavailable`), which a later test may want to stub.

### D3. One copy of the stub adapters, shared with `--smoke`

`smokeStubs.ts` holds the only full stub set today, and `test/decompositionStubs.ts` holds a second copy of the decomposition pair. The new factories move into `src/` (for example `src/decompositionStubs.ts`: `createStubInstructionGenerator()`, `createStubAlignmentProvider()`), the way `createStubImageProvider` and `createStubAssemblyTool` already sit in `src/`. `smokeStubs.ts` calls them. The alignment stub keeps the smoke version's timing: the script's characters spread over 0.95 s, which fits inside the about 1 s stub narration and passes the product's timestamp check. `test/decompositionStubs.ts` keeps its own copy, because it counts calls and uses a 0.25 s step that existing tests depend on.

### D4. The stub assembly tool writes a placeholder file

In the `success` and `slow-success` modes, `createStubAssemblyTool` writes a few fixed bytes to `input.outputPath` (creating the folder if needed) before it returns success, unless a file is already there. Some tests wrap the stub: they write real MP4 bytes and then call it (`final-video-download.test.ts`, `assembly-failure-recovery.test.ts`), and those bytes must survive. The failing modes write nothing. The real ffmpeg tool can't stand in: the stub clips are a 12-byte `ftyp` header that ffmpeg can't decode, and Homebrew's ffmpeg lacks the `subtitles` filter (pinned build needed locally). The file is not a playable MP4. The tests only check that the download serves it.

- *Alternative: generate a real clip with ffmpeg, as `--smoke` does.* Rejected: it ties the test to a local ffmpeg build with libass, and a missing filter would fail it on a developer machine.

### D5. `recordError` also writes the local log, before the consent check

`recordError` is the one function both stage-failure paths and the process handlers call (fact 4), so the fix goes there and not into each caller. `telemetry/index.ts` gets an error-log sink, set by `startServer` to `app.log` after `buildApp`. `recordError` calls `sink.error({ stage, provider, outcome, errorCode }, message)` first, then checks consent as today. The OTLP behaviour is unchanged. Messages go through the same `redactPaths` as the OTLP record, because the file gets the same text. With no sink set (unit tests, in-process `buildApp`), nothing is written. Both callers in `db.ts` (`reportStageAttempt` and `reportProviderRequest`) returned before calling `recordError` when no consent was on, which would skip the log line for most users. That early return was only a shortcut, because `recordProviderCall` and `recordError` check consent themselves, so it is removed. The cost is one small SELECT per finished provider request.

This is a small product change inside a verification epic, which bends the epic's "does not mix with feature changes" rule. The owner accepted it on 2026-11-03: no E16 story writes stage failures to the log file, JOS-255 assumes the line already exists, and JOS-249 AC2 needs it. Uncaught exceptions and unhandled rejections now reach the log file as well, before the process exits.

### D6. The test harness

A small helper in `backend/test/` (for example `workflowServer.ts`) used by both tests:

- `mkdtempSync(join(tmpdir(), "vid4you-workflow-"))` holding `db.sqlite`, `projects/`, `settings.json` (absent: defaults) and `secrets.json` (absent: no keys).
- `spawn(process.execPath, ["src/server.ts"])` with `PORT=0`, `NODE_ENV=development`, the four path variables, the six stub variables, and `VID4YOU_TELEMETRY_ENDPOINT=http://127.0.0.1:9` (fact 5; nothing is exported without consent, and if something were, it would go nowhere).
- The port is read from Fastify's own `Server listening at http://127.0.0.1:<port>` line on stdout. The server's `listening on …` line prints the `PORT` constant, which would be `0`.
- `waitFor(read, done, { timeoutMs, intervalMs })` polls `GET /sessions/:id`. When the bound is reached it throws with the last snapshot it read. There are no fixed sleeps.
- `afterEach` / `finally` kills the child process, waits for it to exit, then `rmSync(scratch, { recursive: true, force: true })`. The test asserts nothing under `backend/data/` changed (its mtime and entries are compared before and after).

The end-to-end test waits for `state === "final-video"` and the four `phases` to be `complete`, then downloads the final video. The failure test (`USE_STUB_IMAGE_PROVIDER=not-retryable-failure`) waits until every scene is `failed` with `affectedStage: "image"`. Then it asserts that the `assembly` phase is still `pending`: the scene completion gate holds assembly back until every scene is complete, so no wait is needed to prove it never started. Last, it reads `logs/vid4you.log` and finds a line with `level` 50 (pino's `error`) and `stage: "image"`.

`RETRY_BASE_DELAY_SECONDS=0` and `RETRY_CAP_DELAY_SECONDS=0` are set so that no retry delay can stretch the run. The poll bound is 60 s per test, inside a test timeout of 90 s, above the suite's 20 s default.

## Risks / Trade-offs

- [Slow CI runners make the spawned run flaky] → The poll bound is generous (60 s), and the stubs answer at once. A timeout shows the last snapshot, so a slow run and a stuck one can be told apart.
- [A stale `backend/.secrets.json` makes a test pass only on one machine (seen before)] → `SECRETS_PATH` points into the scratch folder, so no key is ever loaded. With every provider stubbed, a missing key can't matter.
- [The placeholder file breaks a test that expects the stub to write nothing] → Task 1 runs the full suite after the stub change, before anything else builds on it.
- [Writing every `recordError` to the log adds lines a user may read] → They are failures the user already sees in the app. Messages are path-redacted.
- [A port race between two spawned servers] → `PORT=0` lets the OS pick a free port, and each test has its own scratch folder.

## Migration Plan

None. The new variables are off unless set. The placeholder file only exists under the stub assembly tool. The log line is additive. Rollback is reverting the commits.

## Open Questions

None.
