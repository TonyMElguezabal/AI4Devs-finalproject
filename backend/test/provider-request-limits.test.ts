import { afterEach, describe, expect, it } from "vitest";
import * as concurrency from "../src/concurrency.ts";
import { MAX_SIMULTANEOUS_REQUESTS } from "../src/config/providers.ts";

// limit-provider-requests-per-stage (JOS-167), design Decisions 1-2.

afterEach(() => concurrency.resetAll());

describe("provider request caps", () => {
  it("sets every stage's limit from the constants when the module loads", () => {
    expect(concurrency.stats("decomposition").limit).toBe(50);
    expect(concurrency.stats("image").limit).toBe(200);
    expect(concurrency.stats("voice").limit).toBe(4);
    expect(concurrency.stats("alignment").limit).toBe(2);
    expect(concurrency.stats("video").limit).toBe(4);
  });

  it("keeps the voice stage within the ElevenLabs limit of 5 measured by JOS-188; alignment uses a separate pool", () => {
    expect(MAX_SIMULTANEOUS_REQUESTS.voice).toBeLessThanOrEqual(5);
  });

  it("restores the configured limits on resetAll, including one changed with setLimit", () => {
    concurrency.setLimit("voice", 1);
    concurrency.setLimit("ELSEWHERE", 7);
    concurrency.resetAll();
    expect(concurrency.stats("voice").limit).toBe(4);
    expect(concurrency.stats("ELSEWHERE").limit).toBe(Number.POSITIVE_INFINITY);
  });
});
