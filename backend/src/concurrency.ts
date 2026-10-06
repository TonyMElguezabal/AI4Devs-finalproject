/**
 * A per-stage FIFO semaphore, shared across all runs — proves C3: a
 * hardcoded maximum of simultaneous provider requests per stage, shared
 * across sessions, first come first served. A queued waiter has not sent a
 * request yet (no attempt consumed, no execution-time clock started), so
 * waiting correctly does not count against the retry budget or a per-phase
 * time limit.
 */

const limits = new Map<string, number>();
/** The holders (scene ids) that own a slot, per stage; the in-flight count is the set's size. */
const holders = new Map<string, Set<string>>();
const queues = new Map<string, Array<{ holder: string; onAcquired: () => void }>>();

function holdersOf(stage: string): Set<string> {
  let set = holders.get(stage);
  if (!set) {
    set = new Set();
    holders.set(stage, set);
  }
  return set;
}

export function setLimit(stage: string, limit: number): void {
  limits.set(stage, limit);
}

/** Starts queued waiters, in FIFO order, while the stage has a free slot. */
function startWaiters(stage: string): void {
  const limit = limits.get(stage) ?? Number.POSITIVE_INFINITY;
  const queue = queues.get(stage) ?? [];
  const taken = holdersOf(stage);
  while (queue.length > 0 && taken.size < limit) {
    const next = queue.shift()!;
    taken.add(next.holder);
    next.onAcquired();
  }
}

/**
 * Calls `onAcquired` once a slot is available for `stage`, in FIFO order. The
 * slot belongs to `holder`. A holder that already has a slot or a queue place
 * in `stage` is ignored: the existing entry does the work.
 */
export function acquire(stage: string, holder: string, onAcquired: () => void): void {
  const queue = queues.get(stage) ?? [];
  if (holdersOf(stage).has(holder) || queue.some((waiter) => waiter.holder === holder)) return;
  queue.push({ holder, onAcquired });
  queues.set(stage, queue);
  startWaiters(stage);
}

/**
 * Counts a request that was already sent (before a restart) against `stage`,
 * even at or above the limit, and never queues. New `acquire`s wait until the
 * count drains below the limit. A holder that already has a slot is ignored.
 */
export function occupy(stage: string, holder: string): void {
  holdersOf(stage).add(holder);
}

/**
 * Releases the slot `holder` owns in `stage` and starts the next FIFO waiter,
 * if any. A holder with no slot (never acquired, or already released) changes
 * nothing.
 */
export function release(stage: string, holder: string): void {
  if (!holdersOf(stage).delete(holder)) return;
  startWaiters(stage);
}

export function stats(stage: string): { inFlight: number; queued: number; limit: number } {
  return {
    inFlight: holdersOf(stage).size,
    queued: (queues.get(stage) ?? []).length,
    limit: limits.get(stage) ?? Number.POSITIVE_INFINITY,
  };
}

/** Test-only: wipe all semaphore state between test cases. */
export function resetAll(): void {
  limits.clear();
  holders.clear();
  queues.clear();
}
