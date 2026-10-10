/** retry-or-correct-image (JOS-157) / retry-or-correct-clip (JOS-158) — map
 * shared scene recovery refusal reasons to user-readable sentences. */
const SCENE_RECOVERY_REFUSAL_SENTENCES: Record<string, string> = {
  "unknown-scene": "This scene could not be found.",
  "not-failed": "This scene is not currently failed.",
};

export function sceneRecoveryRefusalSentence(reason: string): string {
  return SCENE_RECOVERY_REFUSAL_SENTENCES[reason] ?? "The action could not be completed.";
}