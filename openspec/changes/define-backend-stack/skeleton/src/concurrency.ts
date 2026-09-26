/**
 * A per-stage FIFO semaphore, shared across all runs — proves C3: a
 * hardcoded maximum of simultaneous provider requests per stage, shared
 * across sessions, first come first served. A queued waiter has not sent a
 * request yet (no attempt consumed, no execution-time clock started), so
 * waiting correctly does not count against the retry budget or a per-phase
 * time limit.
 */

const limits = new Map<string, number>();
const inFlightCounts = new Map<string, number>();
const queues = new Map<string, Array<() => void>>();

export function setLimit(stage: string, limit: number): void {
  limits.set(stage, limit);
}

/** Calls `onAcquired` once a slot is available for `stage`, in FIFO order. */
export function acquire(stage: string, onAcquired: () => void): void {
  const limit = limits.get(stage) ?? Number.POSITIVE_INFINITY;
  const inFlight = inFlightCounts.get(stage) ?? 0;
  if (inFlight < limit) {
    inFlightCounts.set(stage, inFlight + 1);
    onAcquired();
    return;
  }
  const queue = queues.get(stage) ?? [];
  queue.push(onAcquired);
  queues.set(stage, queue);
}

/** Releases a slot for `stage`, immediately handing it to the next FIFO waiter, if any. */
export function release(stage: string): void {
  const queue = queues.get(stage) ?? [];
  const next = queue.shift();
  if (next) {
    // Hand the slot directly to the next waiter; inFlight count is unchanged.
    next();
    return;
  }
  const inFlight = inFlightCounts.get(stage) ?? 0;
  inFlightCounts.set(stage, Math.max(0, inFlight - 1));
}

export function stats(stage: string): { inFlight: number; queued: number; limit: number } {
  return {
    inFlight: inFlightCounts.get(stage) ?? 0,
    queued: (queues.get(stage) ?? []).length,
    limit: limits.get(stage) ?? Number.POSITIVE_INFINITY,
  };
}

/** Test-only: wipe all semaphore state between test cases. */
export function resetAll(): void {
  limits.clear();
  inFlightCounts.clear();
  queues.clear();
}
