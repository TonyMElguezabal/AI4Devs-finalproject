import { SETTINGS } from "./config/providers.ts";
import { activeProfileIdOf, ensureProfiles, getProfile } from "./providerProfiles.ts";

// manage-providers-from-admin (JOS-218), design Decision 4 — the clip durations segmentation and the clip request treat
// as admitted are the active video provider's, read when they run, not constants fixed at start-up. Every whole second
// from `min` to `max` is admitted (segment-script-into-chunks, JOS-140, Decision 6).

export interface ActiveVideoDurations {
  min: number;
  max: number;
  /** Every admitted whole second, ascending. */
  durations: readonly number[];
  /** The active video provider's display name, for messages. */
  label: string;
}

export function activeVideoDurations(): ActiveVideoDurations {
  ensureProfiles();
  const profile = getProfile(activeProfileIdOf("video"));
  const range = (profile?.parameters.admittedDurationSeconds as { min: number; max: number } | undefined) ?? SETTINGS.video.admittedDurationSeconds;
  return {
    min: range.min,
    max: range.max,
    durations: Array.from({ length: range.max - range.min + 1 }, (_, offset) => range.min + offset),
    label: profile?.label ?? SETTINGS.video.name,
  };
}
