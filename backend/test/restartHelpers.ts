import * as concurrency from "../src/concurrency.ts";
import { reconcileOnBoot, VIDEO_STAGE } from "../src/orchestrator.ts";
import { rebuildScheduler, resetScheduler } from "../src/retry/retryScheduler.ts";
import { sweepTimedOutAttempts } from "../src/retry/attemptTimeoutWatcher.ts";
import { STAGE } from "../src/types.ts";

// preserve-progress-across-restarts (JOS-160), design Decision 5 — a restart is simulated by discarding what a
// process loses (request-cap queues and counts, scheduler wake-up timers) while keeping the store, then running
// what `server.ts` runs at boot, in its order. The launcher registry holds only functions, so it is kept as is.

export interface SimulatedRestartOptions {
  /** The per-stage request caps the restarted process starts with. */
  limits?: { image?: number; video?: number };
}

export function simulateRestart(options: SimulatedRestartOptions = {}): ReturnType<typeof reconcileOnBoot> {
  concurrency.resetAll();
  concurrency.setLimit(STAGE, options.limits?.image ?? 10);
  concurrency.setLimit(VIDEO_STAGE, options.limits?.video ?? 10);
  resetScheduler();
  const summary = reconcileOnBoot();
  rebuildScheduler();
  sweepTimedOutAttempts();
  return summary;
}
