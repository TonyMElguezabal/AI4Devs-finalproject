import { claimScheduledAttempt, getScheduledAttempts, getStageAttempt } from "../db.ts";
import * as concurrency from "../concurrency.ts";
import { admitLaunch } from "../launchGate.ts";
import type { AttemptStage, StageAttempt } from "../types.ts";

// bounded-retry-policy (JOS-184) Decisions 4 and 9 — releases scheduled
// attempts. A retry is persisted before anything is armed; the timer is only a
// wake-up call. What sends is a conditional `scheduled -> in-flight` update, so
// a timer, a launch on continue and a startup rebuild can all race for the same
// attempt and exactly one of them sends it.

/**
 * Sends one claimed (now in-flight) attempt: makes the provider call and reports through the recorder. A sender that
 * holds a slot calls `releaseSlot` as soon as its provider call returns (JOS-167, Decision 4); otherwise the slot is
 * released when the sender settles.
 */
export type AttemptSender = (attempt: StageAttempt, releaseSlot: () => void) => void | Promise<void>;

const senders = new Map<AttemptStage, AttemptSender>();
const timers = new Map<string, NodeJS.Timeout>();

export function registerAttemptSender(stage: AttemptStage, sender: AttemptSender): void {
  senders.set(stage, sender);
}

export type ReleaseResult = "sent" | "waiting" | "held" | "not-due" | "gone";

/** What sending a slotted attempt came to: its sender ran and returned `value`, or it was left alone. */
export type SendResult<T> = { sent: true; value: T } | { sent: false; reason: "held" | "gone" };

type SlotKeyResolver = (attempt: StageAttempt) => string | null;

/**
 * JOS-167 Decision 5 — the stage a session-level attempt takes its slot in. Scene-level attempts (image, video) take
 * theirs by scene in the orchestrator, and assembly calls no provider, so neither has a key here. A `timestamps`
 * attempt takes an alignment slot unless its resolver says it will make no call.
 */
const slotKeyResolvers = new Map<AttemptStage, SlotKeyResolver>([
  ["voice-over", () => "voice"],
  ["timestamps", () => "alignment"],
  ["decomposition", () => "decomposition"],
]);

export function registerSlotKeyResolver(stage: AttemptStage, resolver: SlotKeyResolver | undefined): void {
  if (resolver) slotKeyResolvers.set(stage, resolver);
  else if (stage === "timestamps") slotKeyResolvers.set(stage, () => "alignment");
  else slotKeyResolvers.delete(stage);
}

/** Attempts that hold or wait for a slot right now: one dispatch per attempt, so a second release is a no-op. */
const dispatching = new Set<string>();

function dispatch<T>(
  attemptId: string,
  send: AttemptSender | ((attempt: StageAttempt, releaseSlot: () => void) => T | Promise<T>) | undefined,
  now: () => Date,
): { result: ReleaseResult; settled: Promise<SendResult<T>> } {
  const refused = (result: ReleaseResult) => ({
    result,
    settled: Promise.resolve<SendResult<T>>({ sent: false, reason: result === "gone" ? "gone" : "held" }),
  });
  const attempt = getStageAttempt(attemptId);
  if (!attempt || attempt.outcome !== "scheduled") return refused("gone");
  if (dispatching.has(attemptId)) return { result: "waiting", settled: Promise.resolve({ sent: false, reason: "gone" }) };
  if (attempt.dueAt !== null && attempt.dueAt > now().toISOString()) return refused("not-due");

  const admitted = admitLaunch(attempt.runId);
  if (!admitted.admitted) return refused(admitted.reason === "unknown-session" ? "gone" : "held");
  if (!send) return refused("held");

  const key = slotKeyResolvers.get(attempt.stage)?.(attempt) ?? null;
  let result: ReleaseResult = "waiting";
  dispatching.add(attemptId);
  const settled = new Promise<SendResult<T>>((resolve, reject) => {
    const run = (): void => {
      // The claim stamps `sentAt`, so a request that waited has its clock start here, not when it became ready.
      const sentAt = now().toISOString();
      const releaseSlot = () => {
        if (key) concurrency.release(key, attemptId);
      };
      const finish = (outcome: SendResult<T>) => {
        dispatching.delete(attemptId);
        releaseSlot();
        resolve(outcome);
      };
      const stillAdmitted = admitLaunch(attempt.runId);
      if (!stillAdmitted.admitted) return finish({ sent: false, reason: stillAdmitted.reason === "unknown-session" ? "gone" : "held" });
      if (!claimScheduledAttempt(attemptId, sentAt, sentAt)) return finish({ sent: false, reason: "gone" });
      const claimed = getStageAttempt(attemptId);
      if (!claimed) return finish({ sent: false, reason: "gone" });
      result = "sent";
      let called: Promise<T | void>;
      try {
        called = Promise.resolve(send(claimed, releaseSlot));
      } catch (error) {
        called = Promise.reject(error);
      }
      called.then(
          (value) => {
            dispatching.delete(attemptId);
            releaseSlot();
            resolve({ sent: true, value: value as T });
          },
          (error: unknown) => {
            dispatching.delete(attemptId);
            releaseSlot();
            reject(error);
          },
        );
    };
    if (key) concurrency.acquire(key, attemptId, run);
    else run();
  });
  return { result, settled };
}

/**
 * JOS-167 Decisions 3-6 — the only way a session-level attempt goes from `scheduled` to in flight. It takes the
 * attempt's slot (waiting its turn, first come first served), asks the phase-launch gate, claims, and runs `send`.
 * Waiting leaves the attempt `scheduled` with no `sentAt`, so it is neither an attempt used nor execution time.
 * The returned promise settles when `send` does; it stays pending while the attempt waits.
 */
export function sendWithSlot<T>(
  attemptId: string,
  send: (attempt: StageAttempt, releaseSlot: () => void) => T | Promise<T>,
  now: () => Date = () => new Date(),
): Promise<SendResult<T>> {
  return dispatch(attemptId, send, now).settled;
}

/**
 * Asks the phase-launch gate (Decision 4), takes the attempt's slot, claims and sends. A paused session's attempt
 * stays `scheduled` and is released again on continue. `waiting` means it is queued for a slot and will be sent.
 */
export function releaseAttempt(attemptId: string, now: () => Date = () => new Date()): ReleaseResult {
  const attempt = getStageAttempt(attemptId);
  const { result, settled } = dispatch<void>(attemptId, attempt ? senders.get(attempt.stage) : undefined, now);
  settled.catch(() => {});
  return result;
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

/** Test-only: cancels every pending wake-up call and forgets dispatches in progress. */
export function resetScheduler(): void {
  dispatching.clear();
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
}
