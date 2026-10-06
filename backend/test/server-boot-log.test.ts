import { beforeEach, describe, expect, it } from "vitest";
import * as concurrency from "../src/concurrency.ts";
import { PIPELINE_STAGES, resetRegistry } from "../src/launchGate.ts";
import { bootLogFields } from "../src/server.ts";
import { STAGE } from "../src/types.ts";

// harden-backend-foundation (JOS-186) 3.6 — no endpoint exposes the semaphore,
// so the boot log line is the only place the restart-time count can be seen.

beforeEach(() => concurrency.resetAll());

describe("the boot log line", () => {
  it("reports each stage's in-flight count and limit next to the reconciliation summary", () => {
    concurrency.setLimit(STAGE, 2);
    concurrency.setLimit("video", 3);
    concurrency.occupy(STAGE, "image-scene");
    concurrency.occupy("video", "clip-a");
    concurrency.occupy("video", "clip-b");

    const fields = bootLogFields({ resumed: 0, recordedFailedAttempt: 1, stillPending: 3 });

    expect(fields).toEqual({
      resumed: 0,
      recordedFailedAttempt: 1,
      stillPending: 3,
      concurrency: { image: { inFlight: 1, limit: 2 }, video: { inFlight: 2, limit: 3 } },
      noRestartRecovery: [],
    });
  });

  // restart-recovery (JOS-160) — a stage with no registered launcher has no restart recovery, and the log says so.
  it("names the stages that have no restart recovery", () => {
    resetRegistry();

    const fields = bootLogFields({ resumed: 0, recordedFailedAttempt: 0, stillPending: 0 });

    expect(fields.noRestartRecovery).toEqual([...PIPELINE_STAGES]);
  });
});
