/** retry-or-correct-image (JOS-157), design Decisions 2 and 7 — the lookup from a scene retry or correction
 * refusal reason (`ImageRecoveryRefusal` in the backend) to a sentence for the person. Mirrors
 * `retryRefusals.ts`'s pattern for decomposition retry. */
const IMAGE_RECOVERY_REFUSAL_SENTENCES: Record<string, string> = {
  "unknown-scene": "This scene could not be found.",
  "not-failed": "This scene is not currently failed.",
  "image-already-generated": "This scene's image already succeeded; only its clip failed.",
};

export function imageRecoveryRefusalSentence(reason: string): string {
  return IMAGE_RECOVERY_REFUSAL_SENTENCES[reason] ?? "The action could not be completed.";
}
