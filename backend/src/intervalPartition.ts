import type { NarrationInterval } from "./types.ts";

/**
 * assign-narration-intervals (JOS-143), Decision 2 — the intervals, in order, must be contiguous and cover the
 * voice-over from 0 to its duration. Exact comparisons: every boundary comes from one array of numbers, so a correct
 * derivation is bit-identical. Shared by scene registration and by pause edits (adjust-scene-pause, JOS-190), so
 * there is one implementation of the rule. Returns a description of the first problem, or null.
 */
export function findIntervalPartitionProblem(intervals: readonly NarrationInterval[], voiceOverDurationSeconds: number): string | null {
  let previousEnd = 0;
  for (const [position, interval] of intervals.entries()) {
    const number = position + 1;
    const { startSeconds, endSeconds } = interval;
    if (startSeconds !== previousEnd) {
      return position === 0
        ? `scene 1 starts at ${startSeconds} s instead of 0 s`
        : `scene ${number} starts at ${startSeconds} s but scene ${number - 1} ends at ${previousEnd} s`;
    }
    if (!(endSeconds > startSeconds)) return `scene ${number} has an empty narration interval`;
    previousEnd = endSeconds;
  }
  if (previousEnd !== voiceOverDurationSeconds) {
    return `scene ${intervals.length} ends at ${previousEnd} s but the voice-over lasts ${voiceOverDurationSeconds} s`;
  }
  return null;
}
