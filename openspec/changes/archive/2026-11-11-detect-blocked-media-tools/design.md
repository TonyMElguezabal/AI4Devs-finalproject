## Context

The packaged macOS app is unsigned. A browser download leaves `com.apple.quarantine` on the extracted `ffmpeg`, `ffprobe` and app, and Gatekeeper kills those binaries when they start (`ffprobe -version` exits 137). In the JOS-271 incident that produced three failures, all from the same cause:

1. `probeAudio` (`backend/src/voiceOverPhase.ts`) treats only `ENOENT` as "the tool is unavailable". Any other start failure becomes "the returned audio could not be decoded as an MP3", is recorded as `invalid-audio` with a transient outcome, and is retried automatically. Each retry is a paid ElevenLabs request.
2. `ffmpegHasSubtitleFilter` (`backend/src/config/ffmpeg.ts`) remembers its first answer for the life of the process. The boot check ran while `ffmpeg` was blocked, so it remembered `false`, and every later assembly failed as not retryable until a restart.
3. Nothing checks that the tools run before the first paid provider request.

Voice-over is the first paid stage: `POST /sessions` runs the content check (one OpenAI request) and then launches the voice-over.

## Goals / Non-Goals

**Goals**
- A session that could not finish is refused before any spend, with a message the User can act on.
- A blocked `ffprobe` is never retried as if the provider had failed.
- Fixing the cause works without restarting the application.

**Non-Goals**
- Removing the quarantine flag automatically (JOS-271 fix 4), distribution changes (fix 5), the `/health` check (fix 6, JOS-250), signing (JOS-207).
- Checking the tools again at every later paid stage. After a session is accepted, a tool that becomes unusable is caught by Decision 4 (audio check) and by the assembly check (Decision 5).

## Decisions

### Decision 1 — The readiness check runs at `POST /sessions`, before the content check

The check goes in the create-session handler in `backend/src/routes.ts`, before `getScriptModerator().moderate`. A failure answers `503` with `{ ok: false, reason }`, the same shape as the existing unavailable-content-check answer, and creates nothing. The frontend already throws `Error(body.reason)` for non-2xx answers (`frontend/src/api/client.ts`), so the message reaches the User with no frontend change.

Rejected: checking inside `sendVoiceAttempt`. The attempt would already be recorded with a send time, so the usage and cost reports (`readCountedAttempts` counts attempts with a send time and a failed outcome) would show a provider request that never happened. A `not-retryable` outcome also offers no manual retry (`manualRetryAvailable` follows the policy's `retryable`), so the User could not retry after fixing the block. Refusing at creation leaves no state to clean up.

### Decision 2 — A typed check in `backend/src/mediaToolsCheck.ts`, injectable like the content check

`checkMediaTools(): Promise<MediaToolsStatus>` returns a typed outcome, not an exception: `{ ok: true }` or `{ ok: false; problem: "blocked" | "missing" | "failed" | "no-subtitle-filter"; tool: "ffmpeg" | "ffprobe"; message: string }`. It starts `ffmpeg -hide_banner -filters` (this gives both "can run" and "has the `subtitles` filter") and `ffprobe -version`, each with a short timeout. It follows the `getScriptModerator` / `setScriptModerator` / `resetScriptModerator` pattern, and `backend/test/setup.ts` installs a "ready" check before each test, so no test depends on the machine's `ffmpeg`.

`USE_STUB_ASSEMBLY_TOOL` (the manual-testing switch the boot warning already honours) skips the check.

### Decision 3 — One classification of "the tool could not start", shared

`classifyToolStartFailure(error)` in `backend/src/config/ffmpeg.ts` returns `"missing"` for `ENOENT`, `"blocked"` for a process killed by `SIGKILL` or an `EPERM`/`EACCES` start error (what Gatekeeper produces), and `"failed"` for anything else. Both `checkMediaTools` and `probeAudio` use it, so the two cannot disagree. A tool that runs and exits with an error is not a start failure.

Messages carry no file path (`docs/backend-standards.md`: diagnostics shown to the User carry no credentials or paths). The blocked message says the operating system blocked the tool and gives `xattr -dr com.apple.quarantine <the Vid4You folder>`.

### Decision 4 — A tool that cannot start while the audio is measured reuses `probe-unavailable`

`probeAudio` returns `unavailable: true` for `"missing"`, `"blocked"` and `"failed"` start failures, with a detail that names `ffprobe` and the fix. `sendVoiceAttempt` already maps `probe-unavailable` to a `not-retryable` outcome with error code `probe-unavailable`, so no new outcome and no change to the retry policy. Only a tool that runs and cannot read the file stays `invalid-audio`.

Consequence, accepted: no manual retry is offered after this failure, and the returned audio is lost. With Decision 1 this is a rare backstop, only reached if a tool becomes unusable after the session was accepted. A later change could add "retryable after the User fixes it" to the retry policy; it is not needed for this one.

### Decision 5 — Only a positive subtitle-filter answer is cached

`ffmpegHasSubtitleFilter` keeps `subtitleFilterAvailable` only when it is `true`. A `false` answer is computed again on the next call. The cost is one `ffmpeg -filters` start (tens of milliseconds) per call while the answer is negative: at boot, and once per assembly attempt. The assembly adapter and the boot warning keep calling the same function.

## Risks / Trade-offs

- **A developer machine with Homebrew `ffmpeg` (no libass) can no longer create a session.** This is intended, because every assembly would fail after the paid stages. The refusal says what to do (use a build with libass through `FFMPEG_PATH`); `USE_STUB_ASSEMBLY_TOOL` skips the check for manual testing. The backend standards are updated.
- **Two extra process starts per session creation** (about 100 ms with the bundled build). Accepted; session creation is rare and already waits for a network call.
- **The check passes and the tool is blocked later** (for example the folder is moved). Covered by Decisions 4 and 5, not prevented.

## Open Questions

- Should the retry policy get a "failed, manual retry available, no automatic retry" outcome, so a blocked `ffprobe` after acceptance can be retried from the UI? Not needed while Decision 1 prevents the common case.
