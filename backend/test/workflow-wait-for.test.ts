import { describe, expect, it } from "vitest";
import { WaitTimeoutError, waitFor } from "./workflowServer.ts";

// verify-internal-workflow (JOS-243), spec "A stuck session fails the test in bounded time" — the workflow tests' poll.

describe("waitFor", () => {
  it("returns the first value that satisfies the condition", async () => {
    let reads = 0;

    const value = await waitFor(() => Promise.resolve(++reads), (n) => n === 3, { timeoutMs: 1000, intervalMs: 1, what: "three reads" });

    expect(value).toBe(3);
  });

  it("gives up at its bound and names the last state it read", async () => {
    const startedAt = Date.now();

    const waiting = waitFor(() => Promise.resolve({ state: "chunks-processing" }), () => false, { timeoutMs: 50, intervalMs: 5, what: "final-video" });

    await expect(waiting).rejects.toThrow(WaitTimeoutError);
    await expect(waiting).rejects.toThrow(/final-video.*chunks-processing/);
    expect(Date.now() - startedAt).toBeLessThan(1000);
  });
});
