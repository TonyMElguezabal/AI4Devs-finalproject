import { VIDEO_ADMITTED_DURATIONS_SECONDS } from "./config/providers.ts";

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

export function closestAdmittedDuration(narratedSeconds: number): ClosestAdmittedDuration {
  if (!Number.isFinite(narratedSeconds) || narratedSeconds <= 0) {
    throw new RangeError(`a narrated duration must be a positive finite number, got ${narratedSeconds}`);
  }
  let best: ClosestAdmittedDuration | undefined;
  for (const admitted of VIDEO_ADMITTED_DURATIONS_SECONDS) {
    const speedRatio = Math.max(admitted / narratedSeconds, narratedSeconds / admitted);
    // The list is ascending, so a tie is replaced by the later, longer duration.
    if (!best || speedRatio < best.speedRatio - TIE_TOLERANCE || Math.abs(speedRatio - best.speedRatio) <= TIE_TOLERANCE) {
      best = { admitted, speedRatio };
    }
  }
  return best!;
}
