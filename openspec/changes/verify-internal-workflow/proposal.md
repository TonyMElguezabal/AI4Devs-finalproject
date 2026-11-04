## Why

Nothing in CI runs a whole session through the real backend process. The unit suites cover each stage in-process, so a break in how the stages hand off, or in how the server boots and wires its providers, only shows up when the Developer runs a paid session by hand. A free run is not possible today: image, video, voice and assembly can be stubbed by environment variable (`backend/src/bootstrap.ts`), but decomposition (OpenAI), alignment (ElevenLabs) and script moderation (OpenAI, called by `POST /sessions`) cannot. This is JOS-243 (EPIC E14): JOS-247, JOS-248 and JOS-249.

## What Changes

- A new environment variable, `USE_STUB_DECOMPOSITION=success`, replaces the reasoning and alignment providers with succeeding stubs at boot. Without it the real OpenAI and ElevenLabs providers are used, as today. Their attempts are recorded under `stub-` identifiers, so telemetry reports the provider as `stub`.
- A new environment variable, `USE_STUB_SCRIPT_MODERATION=clean`, makes the script check accept every script without calling OpenAI. JOS-247 does not name it, but a session can't start without it, so the epic's goal needs it.
- The stub assembly tool, in its succeeding modes, now writes a small placeholder file at the output path. Today it reports success and writes nothing, so the final-video download answers 404.
- A new CI test spawns `node src/server.ts` with every stub and scratch `DB_PATH`, `PROJECTS_ROOT` and `SETTINGS_PATH` folders, creates a session over HTTP, polls `GET /sessions/:id` until every phase is done, and downloads the final video.
- A second CI test spawns the server with the image stub set to `not-retryable-failure` and checks that the session stops with the image stage failed, never reaches assembly, and leaves an `error`-level record in the log file.
- Every error passed to the telemetry error reporter (`recordError`) is also written to the local log file at `error` level, whether or not error telemetry consent is on. Today a permanent stage failure leaves no line in `vid4you.log`, which JOS-249 needs. The owner accepted this small product change inside a verification epic. The OTLP export is unchanged.
- The packaged `--smoke` stubs reuse the new decomposition stubs instead of their own copy.

## Capabilities

### New Capabilities
- `internal-workflow-verification`: the stub variables a free run needs (decomposition, alignment, script moderation), the stub assembly output, and the two spawned-server workflow tests with their isolation and polling rules.

### Modified Capabilities

- `app-telemetry`: adds the requirement **Reported errors reach the local log file**. Every error given to `recordError` is written to the log file at `error` level, whatever the consent. Existing requirements are unchanged.

## Impact

- **Backend**: `src/bootstrap.ts` reads the two new variables; a new `configureProviderStubs(env)` next to `configureAssemblyTool(env)` in `src/server.ts`; new stub factories for the reasoning and alignment providers in `src/`; `src/stubAssemblyTool.ts` writes its placeholder; `packaging/smokeStubs.ts` reuses the shared stub factories; `src/telemetry/index.ts` (`recordError` writes to a log sink that `bootstrap.ts` sets).
- **Tests**: two new spawned-server tests in `backend/test`, plus unit tests for the variable parsing. They run in the existing CI job (`npm test`); no workflow change, no new dependency.
- **Docs**: the `USE_STUB_*` lists in `backend/README.md`, `docs/development_guide.md` and `readme.md` gain the two variables.
- **Out of scope**: UI journeys, real-provider runs, boundary values (they stay in the unit suites), and the error contract test of E16.
