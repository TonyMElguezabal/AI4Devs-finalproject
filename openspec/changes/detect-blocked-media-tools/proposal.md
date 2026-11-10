## Why

On 2026-11-09 a production run of the packaged, unsigned macOS app lost three paid voice-over requests and stalled at assembly. macOS Gatekeeper killed the quarantined `ffmpeg` and `ffprobe` next to the app. The app reported the killed `ffprobe` as bad audio and retried the paid ElevenLabs request. It then remembered the failed subtitle-filter check until the app was restarted (JOS-271).

## What Changes

- A session is refused at creation when `ffmpeg` or `ffprobe` cannot run, or `ffmpeg` has no `subtitles` filter. The check runs before the paid content check and before any provider request. The refusal says which tool failed and how to fix it. Nothing is created or spent.
- When `ffprobe` cannot run while the returned voice-over audio is checked (killed, not allowed to execute, or missing), the failure is reported as an unavailable tool with a fix, not as invalid audio. It is no longer retried as a transient provider failure.
- The subtitle-filter check no longer remembers a negative answer. Only a positive answer is cached, so removing the block takes effect without restarting the app.

Non-goals: removing the quarantine flag automatically at boot (JOS-271 fix 4), distribution and README changes (fix 5), the `/health` check (fix 6, JOS-250), code signing (JOS-207), a manual retry after a blocked `ffprobe` (see design Decision 4).

## Capabilities

### New Capabilities
- `media-tools-readiness`: the readiness check of `ffmpeg` and `ffprobe` before a session is accepted, its user-facing refusal, and the rule that a failed check is never remembered.

### Modified Capabilities
- `voice-over-generation`: a media tool that cannot run while the returned audio is checked is not reported as invalid audio and is not retried automatically.

## Impact

- Code: `backend/src/config/ffmpeg.ts`, a new `backend/src/mediaToolsCheck.ts`, `backend/src/routes.ts` (`POST /sessions`), `backend/src/voiceOverPhase.ts` (`probeAudio`), `backend/test/setup.ts`.
- API: `POST /sessions` gains a `503` answer for unusable media tools (documented in `docs/api-spec.yml`). No frontend change: the client already shows the response's `reason`.
- No schema change, no migration, no new dependency, no provider cost.
