import { getInFlightAttempts } from "../db.ts";
import { PER_PHASE_MAX_TIME_SECONDS } from "../config/providers.ts";
import type { AttemptStage, StageAttempt } from "../types.ts";
import { attemptDeadline, hasExpired, maxExecutionSeconds } from "./attemptDeadline.ts";
import { recordAttemptTimeout, type RecordedOutcome } from "./stageAttemptRecorder.ts";

// stage-execution-time-limit (JOS-185) Decisions 1, 2, 8 — one watcher over the stored in-flight
// attempts. It keeps no per-attempt timer: the deadline comes from the persisted send time, so a
// restart neither resets nor extends it.

/** What a stage does with a recorded timeout: present its failure, log it. The recorder has already decided retry or exhaustion. */
export type TimeoutHandler = (attempt: StageAttempt, recorded: Exclude<RecordedOutcome, { action: "ignored" }>, detail: { now: Date; limitSeconds: number }) => void;

const handlers = new Map<AttemptStage, TimeoutHandler>();

/**
 * A stage opts in by registering how it presents a timeout. A stage with no handler is never timed out
 * here: its attempt would end `timed-out` with nothing on the session saying so. Stages that already
 * abort their own request at the limit (alignment, decomposition) or that have no limit yet (assembly)
 * stay out until they record their attempts through the recorder.
 */
export function registerTimeoutHandler(stage: AttemptStage, handler: TimeoutHandler): void {
  handlers.set(stage, handler);
}

/** Times out every in-flight attempt past its deadline; returns how many were timed out by this sweep. */
export function sweepTimedOutAttempts(now: Date = new Date(), limits: Parameters<typeof attemptDeadline>[1] = PER_PHASE_MAX_TIME_SECONDS): number {
  let timedOut = 0;
  for (const attempt of getInFlightAttempts()) {
    const handler = handlers.get(attempt.stage);
    if (!handler || !hasExpired(attempt, now, limits)) continue;
    const limitSeconds = maxExecutionSeconds(attempt.stage, limits)!; // hasExpired is false without a limit
    const recorded = recordAttemptTimeout(attempt.id, `the attempt had no result after ${limitSeconds} s`, { now: () => now });
    if (recorded.action === "ignored") continue; // a result won the race
    timedOut++;
    handler(attempt, recorded, { now, limitSeconds });
  }
  return timedOut;
}

/** Decision 8 — well below the smallest per-phase maximum time (alignment, 5 s), so a timeout is found within about a second. */
const CHECK_INTERVAL_MS = 1000;

/** Sweeps once now (an attempt whose limit passed while the application was down is timed out at startup), then on a fixed interval. */
export function startAttemptTimeoutWatcher(intervalMs: number = CHECK_INTERVAL_MS): () => void {
  sweepTimedOutAttempts();
  const timer = setInterval(() => sweepTimedOutAttempts(), intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
