/** The usual narration pace; the video's length follows the voice-over (PRD §7.3).
 * One rate for every language (show-script-word-count, JOS-236, design Decision 2). */
export const NARRATION_WORDS_PER_MINUTE = 150;

export interface ScriptEstimate {
  words: number;
  seconds: number;
}

/** Word count and rough narrated duration of a script, or `null` while it is blank. */
export function estimateScript(script: string): ScriptEstimate | null {
  const trimmed = script.trim();
  if (trimmed.length === 0) return null;
  const words = trimmed.split(/\s+/).length;
  return { words, seconds: Math.round((words * 60) / NARRATION_WORDS_PER_MINUTE) };
}

/** `38 words · Estimated video duration ~0:15` */
export function formatEstimate({ words, seconds }: ScriptEstimate): string {
  const minutes = Math.floor(seconds / 60);
  const rest = String(seconds % 60).padStart(2, "0");
  return `${words} ${words === 1 ? "word" : "words"} · Estimated video duration ~${minutes}:${rest}`;
}
