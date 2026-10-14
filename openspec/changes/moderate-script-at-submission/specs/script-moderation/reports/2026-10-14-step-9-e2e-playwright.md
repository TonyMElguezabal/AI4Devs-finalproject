# Step 9 — End-to-end browser check

**Change:** moderate-script-at-submission (JOS-187)
**Date:** 2026-10-14
**Branch:** `feature/jos-187-moderate-script-at-submission`

Backend (real `OPENAI_KEY`, isolated `DB_PATH`/`PROJECTS_ROOT`) and the Vite frontend ran from the
worktree; driven in Chrome through the Claude-in-Chrome tools rather than the Playwright CLI.
No ElevenLabs credential was present, so no downstream provider was billed.

| # | Step | Observed |
|---|---|---|
| 9.2 | Submit the step-7a device script (English) | The form shows "Error: The script was refused by the provider's content policy (flagged: illicit, illicit/violent, violence). Edit the script and submit it again." Title, script and language keep their values; no session page opens |
| 9.3 | Replace the script with a clean one and submit | The URL gains a `sessionId` and the session page opens (`connected`). Voice-over then fails with "missing credential 'ELEVENLABS_KEY'", as expected in this setup; the moderation gate had passed |
| 9.4 | Clean up | Both servers stopped and the isolated store and project folder removed; the shared local DB was never used |

## Notes

- The reason is prefixed with "Error: " because `App.tsx` renders `String(err)`. This predates the
  change and the reason is fully legible, so it is left as is.
