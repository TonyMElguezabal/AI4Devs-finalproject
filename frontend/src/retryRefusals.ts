/** retry-decomposition (JOS-156), Decision 8 — the one lookup from a retry refusal reason to a sentence for the person. */
const RETRY_REFUSAL_SENTENCES: Record<string, string> = {
  "session-not-found": "This session was not found.",
  "already-registered": "The script was already divided into chunks, so there is nothing to retry.",
  "retry-already-pending": "A retry is already waiting or running.",
  "not-failed-in-decomposition": "The decomposition has not failed, so it cannot be retried.",
  "not-retryable": "This failure cannot be retried.",
  // retry-final-assembly (JOS-159).
  "not-failed-in-assembly": "The final video has not failed, so it cannot be retried.",
  "scenes-not-complete": "Not every scene is ready yet, so the final video cannot be retried.",
  "final-video-already-generated": "The final video was already generated.",
};

export function retryRefusalSentence(reason: string): string {
  return RETRY_REFUSAL_SENTENCES[reason] ?? "The retry could not be started.";
}
