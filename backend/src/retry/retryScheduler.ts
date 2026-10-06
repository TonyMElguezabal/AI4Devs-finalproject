import { claimScheduledAttempt, getScheduledAttempts, getStageAttempt } from "../db.ts";
import { admitLaunch } from "../launchGate.ts";
import type { AttemptStage, StageAttempt } from "../types.ts";

// bounded-retry-policy (JOS-184) Decisions 4 and 9 — releases scheduled
// attempts. A retry is persisted before anything is armed; the timer is only a
// wake-up call. What sends is a conditional `scheduled -> in-flight` update, so
// a timer, a launch on continue and a startup rebuild can all race for the same
// attempt and exactly one of them sends it.

/** Sends one claimed (now in-flight) attempt: makes the provider call and reports through the recorder. */
export type AttemptSender = (attempt: StageAttempt) => void | Promise<void>;

const senders = new Map<AttemptStage, AttemptSender>();
const timers = new Map<string, NodeJS.Timeout>();

export function registerAttemptSender(stage: AttemptStage, sender: AttemptSender): void {
  senders.set(stage, sender);
}

export type ReleaseResult = "sent" | "held" | "not-due" | "gone";

/**
 * Asks the phase-launch gate (Decision 4), then claims and sends. The gate
 * check and the claim happen with no await between them. A paused session's
 * attempt stays `scheduled` and is released again on continue.
 */
export function releaseAttempt(attemptId: string, now: () => Date = () => new Date()): ReleaseResult {
  const attempt = getStageAttempt(attemptId);
  if (!attempt || attempt.outcome !== "scheduled") return "gone";
  const moment = now().toISOString();
  if (attempt.dueAt !== null && attempt.dueAt > moment) return "not-due";

  const admitted = admitLaunch(attempt.runId);
  if (!admitted.admitted) return admitted.reason === "unknown-session" ? "gone" : "held";
  const sender = senders.get(attempt.stage);
  if (!sender) return "held";
  if (!claimScheduledAttempt(attemptId, moment, moment)) return "gone";

  const claimed = getStageAttempt(attemptId);
  if (!claimed) return "gone";
  Promise.resolve(sender(claimed)).catch(() => {});
  return "sent";
}

/** Releases every due scheduled attempt of one session — what continuing a paused session does. */
export function releaseSessionAttempts(sessionId: string, now: () => Date = () => new Date()): number {
  return getScheduledAttempts()
    .filter((attempt) => attempt.runId === sessionId)
    .filter((attempt) => releaseAttempt(attempt.id, now) === "sent").length;
}

export function hasScheduledAttempt(sessionId: string): boolean {
  return getScheduledAttempts().some((attempt) => attempt.runId === sessionId);
}

/** Wakes up when the attempt is due (immediately when it already is). */
export function armScheduledAttempt(attempt: StageAttempt, now: () => Date = () => new Date()): void {
  const existing = timers.get(attempt.id);
  if (existing) clearTimeout(existing);
  const waitMs = Math.max(0, Date.parse(attempt.dueAt ?? "") - now().getTime() || 0);
  const timer = setTimeout(() => {
    timers.delete(attempt.id);
    releaseAttempt(attempt.id);
  }, waitMs);
  timer.unref();
  timers.set(attempt.id, timer);
}

/** Startup (Decision 9) — every persisted scheduled attempt gets its wake-up call again. */
export function rebuildScheduler(): number {
  const scheduled = getScheduledAttempts();
  for (const attempt of scheduled) armScheduledAttempt(attempt);
  return scheduled.length;
}

/** Test-only: cancels every pending wake-up call. */
export function resetScheduler(): void {
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
}
