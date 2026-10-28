// adjust-scene-pause (JOS-190) — the refusals of the pause dial and of the rebuild, as sentences. The server's own 422 is
// already a sentence (it names the scene's range), so anything with a space in it is shown as it came.

const PAUSE_REFUSAL_SENTENCES: Record<string, string> = {
  "session-not-found": "This session could not be found.",
  "unknown-scene": "This scene could not be found.",
  "no-final-video": "There is no final video to adjust yet.",
  "assembly-in-progress": "The final video is being built. Try again when it is ready.",
  "no-pause": "The pause after this scene cannot be adjusted.",
  "nothing-to-rebuild": "There are no changes to rebuild.",
  // rebuild-scene (JOS-235)
  "scenes-not-complete": "A scene is still being generated. Try again when every scene is done.",
};

export function pauseRefusalSentence(reason: string, fallback = "The change could not be saved."): string {
  return PAUSE_REFUSAL_SENTENCES[reason] ?? (reason.includes(" ") ? reason : fallback);
}

/**
 * surface-pause-continue-failure (JOS-217), design Decision 2 — the session's own Pause and Continue, not the scene dial.
 * Unlike `pauseRefusalSentence`, no reason is shown as it came: `unknown session` and a network error are not sentences.
 */
export function sessionPauseRefusalSentence(action: "pause" | "continue", reason: string): string {
  if (reason === "unknown session") return "This session could not be found.";
  return action === "pause" ? "The session could not be paused." : "The session could not be continued.";
}
