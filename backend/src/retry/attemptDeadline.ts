import { PER_PHASE_MAX_TIME_SECONDS } from "../config/providers.ts";
import type { AttemptStage, StageAttempt } from "../types.ts";

// stage-execution-time-limit (JOS-185) Decision 1 — pure code, no I/O. The deadline is
// derived from the persisted send time, never from a timer, so it survives a restart.

type PhaseLimits = Record<keyof typeof PER_PHASE_MAX_TIME_SECONDS, number | "undetermined">;

/** The constants module names its limits by provider phase; the attempt record names its stages. */
const LIMIT_KEY: Record<AttemptStage, keyof typeof PER_PHASE_MAX_TIME_SECONDS> = {
  "voice-over": "voice",
  timestamps: "alignment",
  decomposition: "decomposition",
  image: "image",
  video: "video",
  assembly: "assembly",
};

/** The stage's maximum execution time in seconds, or null while the constants leave it undetermined. */
export function maxExecutionSeconds(stage: AttemptStage, limits: PhaseLimits = PER_PHASE_MAX_TIME_SECONDS): number | null {
  const seconds = limits[LIMIT_KEY[stage]];
  return seconds === "undetermined" ? null : seconds;
}

/** Send time plus the stage's maximum time; null for an unsent attempt or a stage with no limit. */
export function attemptDeadline(
  attempt: Pick<StageAttempt, "stage" | "sentAt">,
  limits: PhaseLimits = PER_PHASE_MAX_TIME_SECONDS,
): Date | null {
  const seconds = maxExecutionSeconds(attempt.stage, limits);
  if (attempt.sentAt === null || seconds === null) return null;
  return new Date(new Date(attempt.sentAt).getTime() + seconds * 1000);
}

/** True once `now` is past the deadline; exactly at the deadline is not yet over it. */
export function hasExpired(
  attempt: Pick<StageAttempt, "stage" | "sentAt">,
  now: Date,
  limits: PhaseLimits = PER_PHASE_MAX_TIME_SECONDS,
): boolean {
  const deadline = attemptDeadline(attempt, limits);
  return deadline !== null && now.getTime() > deadline.getTime();
}
