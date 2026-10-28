/** retry-or-correct-image (JOS-157) / retry-or-correct-clip (JOS-158) — map
 * shared scene recovery refusal reasons to user-readable sentences. */
const SCENE_RECOVERY_REFUSAL_SENTENCES: Record<string, string> = {
  "unknown-scene": "This scene could not be found.",
  "not-failed": "This scene is not currently failed.",
  // rebuild-scene (JOS-235)
  "scene-not-ready": "This scene is being generated right now. Try again when it finishes.",
  "assembly-in-progress": "The final video is being built. Try again when it finishes.",
};

export function sceneRecoveryRefusalSentence(reason: string): string {
  return SCENE_RECOVERY_REFUSAL_SENTENCES[reason] ?? "The action could not be completed.";
}