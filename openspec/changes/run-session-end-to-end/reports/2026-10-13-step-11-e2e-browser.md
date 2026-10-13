# Step 11 — browser end-to-end (run-session-end-to-end, JOS-195)

- Date: 2026-10-13
- Chrome (Claude in Chrome) against the Vite dev server on `127.0.0.1:5173` and the backend from this branch on `127.0.0.1:3100`, temporary store.
- Backend flags: `USE_STUB_VOICE_PROVIDER=success-after-limit` (the narration lands after about 13 s, which leaves a window to pause), `USE_STUB_VIDEO_PROVIDER=success`, `USE_STUB_ASSEMBLY_TOOL=success`; `ALLOW_TEST_ENDPOINTS` unset; **no provider keys**.

| Task | Step | Observed |
|---|---|---|
| 11.1 | typed a title and a two-sentence script, chose English, **Start project** | session page opened: `Session: … — connected`, state `voice-over-generating`, Voice-over "In progress", Decomposition / Scenes / Final video "Not started" |
| 11.3 | **Pause session** while the narration was generating; waited | state `voice-over-complete`, "Paused — waiting for you to continue", "Nothing is generating", "Waiting for continue: 1 decomposition", Decomposition "Not started — Waiting for you to continue (1 held)", Voice-over "Complete, 2 attempts" |
| 11.3 | **Continue session** | no reload: state `failed`, phase `decomposition`, cause "…missing credential 'ELEVENLABS_KEY'…", "Timestamps: ElevenLabs (forced alignment), 1 attempt" — the decomposition started by itself on continue |
| 11.2 | a second session, **no click after Start** | after the narration the page moved on its own from `voice-over-generating` to the decomposition phase (`failed`, same cause, no keys) with no reload |
| — | browser console | no errors |
| 11.4 | restore | both servers stopped, tab closed, temporary stores removed |

## Notes
- Without keys the decomposition fails at its first provider call; the point of this run is the hand-off and its pause behaviour, which the page shows as specified in `paused-session-display`. A run through scenes and the final video with real providers belongs to the product owner's E2E on the rebuilt local executable.
- The first click on **Start project** after filling the form with element references did not submit (the form fields had been set programmatically); clicking the button by its reference after a coordinate click did. This is a driver behaviour, not an application one.
