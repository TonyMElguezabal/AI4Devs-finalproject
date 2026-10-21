import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRun, createScene, getProviderRequest, resetAll } from "../src/db.ts";
import * as provider from "../src/provider.ts";

describe("stub provider push delivery", () => {
  beforeEach(() => {
    resetAll();
    vi.useFakeTimers({ toFake: ["setTimeout"] });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("does not deliver when the timer fires before the wall clock reaches sentAt + latency, and delivers once it does", () => {
    createRun("r1", "run", "script", "en");
    createScene("s1", "r1", 1, "success", 20);
    const onDeliver = vi.fn();
    const requestId = provider.send("s1", 1, "success", 20, onDeliver);
    const completesAt = new Date(getProviderRequest(requestId)!.sentAt).getTime() + 20;

    const now = vi.spyOn(Date, "now").mockReturnValue(completesAt - 1); // the timer fired 1 ms early
    vi.advanceTimersByTime(20);
    expect(onDeliver).not.toHaveBeenCalled();

    now.mockReturnValue(completesAt);
    vi.advanceTimersByTime(1);
    expect(onDeliver).toHaveBeenCalledExactlyOnceWith(requestId);
  });
});
