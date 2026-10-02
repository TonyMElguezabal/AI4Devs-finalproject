import { VIDEO_ADMITTED_DURATIONS_SECONDS } from "./config/providers.ts";
import type { DurationWarning, NarrationInterval } from "./types.ts";

// segment-script-into-chunks (JOS-140) — PRD §7.2: the clip duration the video
// provider admits that is "closest" to a narrated interval. Closest means the
// smallest speed change (the ratio between the two durations, whichever way the
// clip has to be slowed or sped up), not the fewest seconds; an exact tie goes
// to the longer duration. Pure: the segmentation search and, later, the clip
// request (JOS-147) both use it.

export interface ClosestAdmittedDuration {
  /** The admitted clip duration, in seconds. */
  admitted: number;
  /** The speed change needed to fit the narrated interval: `max(admitted / narrated, narrated / admitted)`, so always at least 1. */
  speedRatio: number;
}

/** Ratios closer than this are an exact tie (floating-point noise), which goes to the longer duration. */
const TIE_TOLERANCE = 1e-12;

// Moved here from sceneRegistration.ts (request-admitted-clip-duration, JOS-147):
// requestedClipDuration below needs it, and sceneRegistration.ts needs
// requestedClipDuration, so the derivation lives on this side of that
// dependency to avoid a cycle. Re-exported from sceneRegistration.ts so
// existing callers are unaffected.
/** The narrated duration of an interval; the one place it is derived, so a duration can never disagree with its interval. */
export function intervalDurationSeconds(interval: NarrationInterval): number {
  return interval.endSeconds - interval.startSeconds;
}

export function closestAdmittedDuration(
  narratedSeconds: number,
  admitted: readonly number[] = VIDEO_ADMITTED_DURATIONS_SECONDS,
): ClosestAdmittedDuration {
  if (!Number.isFinite(narratedSeconds) || narratedSeconds <= 0) {
    throw new RangeError(`a narrated duration must be a positive finite number, got ${narratedSeconds}`);
  }
  let best: ClosestAdmittedDuration | undefined;
  for (const candidate of admitted) {
    const speedRatio = Math.max(candidate / narratedSeconds, narratedSeconds / candidate);
    // The list is ascending, so a tie is replaced by the later, longer duration.
    if (!best || speedRatio < best.speedRatio - TIE_TOLERANCE || Math.abs(speedRatio - best.speedRatio) <= TIE_TOLERANCE) {
      best = { admitted: candidate, speedRatio };
    }
  }
  return best!;
}

export interface RequestedClipDuration {
  /** The admitted duration to request, in seconds. */
  seconds: number;
  /** Set only when the interval is narrated longer than the largest admitted duration. */
  warning: DurationWarning | null;
  /**
   * The speed-adjustment factor this duration implies: `closestAdmittedDuration`'s
   * own `speedRatio` for the chosen duration, passed through unchanged
   * (record-speed-adjustment-factor, JOS-148, design Decision 1) rather than
   * recomputed — always ≥ 1.
   */
  factor: number;
}

/**
 * request-admitted-clip-duration (JOS-147), design Decision 1 — the duration a
 * chunk's clip is requested at, derived from its stored narration interval
 * through the same rule `closestAdmittedDuration` already implements. The
 * warning is derived from the interval, not from segmentation's
 * `unsplittable-sentence` flag: registration already refuses a fragment over
 * the maximum without that flag, so the two agree for every registered chunk,
 * and the interval is what is stored (see design.md Decision 1).
 */
export function requestedClipDuration(
  interval: NarrationInterval,
  admitted: readonly number[] = VIDEO_ADMITTED_DURATIONS_SECONDS,
): RequestedClipDuration {
  const narratedSeconds = intervalDurationSeconds(interval);
  const { admitted: seconds, speedRatio: factor } = closestAdmittedDuration(narratedSeconds, admitted);
  // `admitted` is ascending (closestAdmittedDuration's own invariant), so its last entry is the largest.
  const largestAdmitted = admitted[admitted.length - 1]!;
  const warning: DurationWarning | null = narratedSeconds > largestAdmitted ? "exceeds-maximum" : null;
  return { seconds, warning, factor };
}
