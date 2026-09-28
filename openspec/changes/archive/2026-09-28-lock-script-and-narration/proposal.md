# Lock the script at project start and the narration once complete

Linear-Issue: JOS-137 (US-04)

## Why

Every scene has to stay faithful to what was narrated (§4.2, D10). That only holds if two things never change: the script, from the moment the project starts, and the MP3, once one exists. Today neither is actually enforced. `start-video-project` (JOS-134, Decision 2) promised a script lock "enforced where the data lives", but what shipped is a convention: no route happens to update the script, and nothing in the store would refuse it. `generate-voice-over` (JOS-136) keeps one voice-over per session, but nothing yet stops that row, or the MP3 it points to, from being replaced. The retry stories (US-22, US-23) are about to add code that touches failed sessions, so the rule needs to exist in one place before they arrive.

## What Changes

- **AC1 — Script lock:** a session's script can't be modified in any state from `submitted` onward, including while paused and after a voice failure. The store itself refuses the change, and the API offers no operation that modifies it. Title and language get the same protection, as `start-video-project` already promised for them.
- **AC2 — Narration lock:** once a voice-over exists, the completed MP3 is never replaced. The store refuses to update or delete the voice-over record, and no voice generation launches for a session that has one.
- **AC3 — A retry after a failed attempt is allowed:** a session whose voice attempt failed before producing valid audio has no voice-over record, so voice generation may launch again. That launch is not treated as regenerating a completed narration.
- One guard, `canLaunchVoiceOver(session)`, answers the AC2/AC3 question for every caller: `generate-voice-over`'s launch now, the automatic retry (JOS-154) and the manual retry (JOS-155) later.

## Out of Scope (owned by other tickets)

- The manual voice retry endpoint itself: **JOS-155 (US-23)**. This story provides the guard it must call and proves the guard allows a failed session.
- Automatic retries: **JOS-154 (US-22)**.
- Correcting `IMAGE`/`VIDEO` instructions after a failure (§10.3), the one editable field on a scene: **JOS-157, JOS-158**. It doesn't touch the script.
- Any frontend change. The session page has no edit control for the script, and this story keeps it that way.

## Capabilities

### New Capabilities

- `content-lock`: which parts of a session are immutable and from when (script, title and language from registration; the narration once complete), how that is enforced, and why a retry after a failed voice attempt is not a regeneration.

### Modified Capabilities

None. `session-creation` (from `start-video-project`) and `voice-over-generation` (from `generate-voice-over`) are not archived yet, so there is no spec in `openspec/specs/` to modify. This change backs their existing lock requirements with enforcement and does not change what they say.

## Impact

- **Depends on** JOS-134 (done: sessions and the stored script) and JOS-136 (in progress: the `voice_overs` table, migration 4, and the voice launch). This change is stacked on the JOS-136 branch.
- **Backend:**
  - two migrations adding store triggers that refuse updating `runs.title`, `runs.script` and `runs.language`, and refuse updating or deleting a `voice_overs` row
  - `canLaunchVoiceOver` in the domain layer
  - `generate-voice-over`'s launch goes through the guard
- **API:** no new route. A test asserts that no route modifies a session's script, title or language, and that no route regenerates the narration.
- **Data model:** no new columns. `docs/data-model.md` records the triggers as part of the store's guarantees.
- **Test-only reset:** `resetAll()` deletes rows, which the voice-over trigger would refuse. The design explains how tests keep working without weakening the rule.
