# Consult a session by its identifier

Linear-Issue: JOS-135

## Why

`start-video-project` (JOS-134) gives the User an identifier and nothing to use it with. §12.3 makes the identifier the only way back to a session: there is no project list, no account, and no search. A session the User cannot open is a session they have lost, and every later story that shows progress, results, errors or downloads (US-18, US-19, US-21, US-31, US-32, US-34) needs a page and a read to show them on.

It is also where §12.3's integrity rule becomes observable. Titles repeat across sessions (§3, §12.2) and scene identifiers restart at 1 in every session (§6), so the easiest mistakes — looking up by title, or by scene identifier alone — produce a page that shows another project's scenes or files. AC22 requires that a consulted session shows only its own chunks, files and results.

## What Changes

- Add a **session read** by identifier that returns the title, script, language, state, paused marker, creation time, and every scene with its current state and results — the same read `define-live-updates` (JOS-183, Decision 4) requires for resync on reconnect. One representation serves both (§8.3, §12.3).
- Add a **session page** reached by identifier, showing the title, the script as submitted, the session's progress and whatever results exist, with scenes in ascending identifier order (§6, §8.3).
- Scope every lookup — session, scenes, files — by the session identifier, so two sessions with the same title, or two scenes with ID 1, can never be confused (§3, §6, AC22).
- Report an unknown or malformed identifier as "not found", distinguishably from a server failure, and show the User a way back to starting a project.
- Request no account, login or credential of any kind (§2.3, §12.3).
- Keep sessions consultable indefinitely: no expiry and no age-based refusal (§12.2).
- Expose **no** download or content of the MP3, timestamps or generated texts (§12.3); per-scene and final-video downloads belong to US-31 and US-32.

## Capabilities

### New Capabilities

- `session-consultation`: reaching a session by its identifier — what the read returns, what the page shows, how an unknown identifier is reported, and the guarantee that a consulted session exposes only its own data.

### Modified Capabilities

None. `openspec/specs/` is still empty. `session-creation` (JOS-134), `voice-over-generation` (JOS-136) and `live-updates-foundation` (JOS-183) are not yet archived; this change must stay consistent with all three, and in particular must *be* the snapshot read `live-updates-foundation` requires rather than a second one.

## Impact

- **Blocked on**: `start-video-project` (JOS-134) for sessions to consult; `define-backend-stack` (JOS-179), `define-frontend-stack` (JOS-180) and `define-persistence` (JOS-181) for the framework, the page and the store. `define-live-updates` (JOS-183) fixes the payload shape this read must share.
- **API contract**: first read endpoint in `docs/api-spec.yml`, with the session representation later stories extend (`generate-voice-over` already adds `voiceOver` and `failure` to it).
- **Frontend**: first screen after the start form, and the page every progress, results and diagnostics story renders into.
- **Product gap made concrete**: with no project list anywhere in the PRD or backlog, a User who loses the identifier cannot find the session. This change makes the identifier bookmarkable as a URL and records the gap; it does not invent a list.
- **Not included**: live updates on the open page (US-18, via JOS-183), per-phase and per-scene rendering beyond state and available results (US-18, US-19), downloads (US-31, US-32), diagnostics (US-34), pause (US-20, US-21).
