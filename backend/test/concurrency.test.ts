import { beforeEach, describe, expect, it } from "vitest";
import * as concurrency from "../src/concurrency.ts";

const STAGE = "TEST_STAGE";

beforeEach(() => {
  concurrency.resetAll();
  concurrency.setLimit(STAGE, 2);
});

describe("concurrency: slots belong to a holder", () => {
  it("ignores a release by a holder with no slot, even with a waiter queued at the cap", () => {
    const started: string[] = [];
    concurrency.acquire(STAGE, "a", () => started.push("a"));
    concurrency.acquire(STAGE, "b", () => started.push("b"));
    concurrency.acquire(STAGE, "c", () => started.push("c")); // queued

    concurrency.release(STAGE, "stranger");

    expect(started).toEqual(["a", "b"]);
    expect(concurrency.stats(STAGE)).toEqual({ inFlight: 2, queued: 1, limit: 2 });
  });

  it("frees one slot and starts at most one waiter when the same holder releases twice", () => {
    const started: string[] = [];
    concurrency.acquire(STAGE, "a", () => started.push("a"));
    concurrency.acquire(STAGE, "b", () => started.push("b"));
    concurrency.acquire(STAGE, "c", () => started.push("c")); // queued
    concurrency.acquire(STAGE, "d", () => started.push("d")); // queued

    concurrency.release(STAGE, "a");
    concurrency.release(STAGE, "a");

    expect(started).toEqual(["a", "b", "c"]);
    expect(concurrency.stats(STAGE)).toEqual({ inFlight: 2, queued: 1, limit: 2 });
  });

  it("hands the slot to the waiter's holder, so the previous holder releasing again does nothing", () => {
    const started: string[] = [];
    concurrency.acquire(STAGE, "a", () => started.push("a"));
    concurrency.acquire(STAGE, "b", () => started.push("b"));
    concurrency.acquire(STAGE, "c", () => started.push("c")); // queued
    concurrency.acquire(STAGE, "d", () => started.push("d")); // queued

    concurrency.release(STAGE, "a"); // c takes the slot
    concurrency.release(STAGE, "a"); // stray: must not start d

    expect(started).toEqual(["a", "b", "c"]);
    expect(concurrency.stats(STAGE).inFlight).toBe(2);

    concurrency.release(STAGE, "c"); // c really releases: d starts
    expect(started).toEqual(["a", "b", "c", "d"]);
  });

  it("queues and releases in FIFO order", () => {
    const started: string[] = [];
    for (const holder of ["a", "b", "c", "d"]) concurrency.acquire(STAGE, holder, () => started.push(holder));
    expect(concurrency.stats(STAGE)).toEqual({ inFlight: 2, queued: 2, limit: 2 });

    concurrency.release(STAGE, "a");
    concurrency.release(STAGE, "b");

    expect(started).toEqual(["a", "b", "c", "d"]);
    expect(concurrency.stats(STAGE)).toEqual({ inFlight: 2, queued: 0, limit: 2 });
  });

  it("queues a holder that is launched twice only once", () => {
    const started: string[] = [];
    concurrency.acquire(STAGE, "a", () => started.push("a"));
    concurrency.acquire(STAGE, "b", () => started.push("b"));
    concurrency.acquire(STAGE, "c", () => started.push("c")); // queued
    concurrency.acquire(STAGE, "c", () => started.push("c-again")); // ignored

    expect(concurrency.stats(STAGE).queued).toBe(1);

    concurrency.release(STAGE, "a");
    expect(started).toEqual(["a", "b", "c"]);
    expect(concurrency.stats(STAGE)).toEqual({ inFlight: 2, queued: 0, limit: 2 });
  });

  it("ignores an acquire by a holder that already holds a slot", () => {
    const started: string[] = [];
    concurrency.acquire(STAGE, "a", () => started.push("a"));
    concurrency.acquire(STAGE, "a", () => started.push("a-again"));

    expect(started).toEqual(["a"]);
    expect(concurrency.stats(STAGE).inFlight).toBe(1);

    concurrency.release(STAGE, "a");
    expect(concurrency.stats(STAGE).inFlight).toBe(0);
  });
});

describe("concurrency: occupy counts a request that is already sent", () => {
  it("adds a holder above the limit without queuing", () => {
    concurrency.occupy(STAGE, "a");
    concurrency.occupy(STAGE, "b");
    concurrency.occupy(STAGE, "c");

    expect(concurrency.stats(STAGE)).toEqual({ inFlight: 3, queued: 0, limit: 2 });
  });

  it("does not grant an acquire while the count is at or above the limit, and grants once it drains below", () => {
    const started: string[] = [];
    concurrency.occupy(STAGE, "a");
    concurrency.occupy(STAGE, "b");
    concurrency.occupy(STAGE, "c");
    concurrency.acquire(STAGE, "d", () => started.push("d"));

    concurrency.release(STAGE, "a"); // 3 -> 2: still at the limit
    expect(started).toEqual([]);

    concurrency.release(STAGE, "b"); // 2 -> 1: below the limit
    expect(started).toEqual(["d"]);
    expect(concurrency.stats(STAGE)).toEqual({ inFlight: 2, queued: 0, limit: 2 });
  });

  it("is idempotent for a holder that already holds a slot", () => {
    concurrency.occupy(STAGE, "a");
    concurrency.occupy(STAGE, "a");

    expect(concurrency.stats(STAGE).inFlight).toBe(1);
  });
});
