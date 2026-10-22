import { describe, expect, it } from "vitest";
import { nearestRankPercentile } from "../src/providerUsageReport.ts";

// report-provider-usage (JOS-223), task 2.1 — design Decision 2: nearest rank, `sorted[ceil(p × n) − 1]`.

const range = (count: number): number[] => Array.from({ length: count }, (_, index) => index + 1);

describe("nearestRankPercentile", () => {
  it("returns null for an empty list", () => {
    expect(nearestRankPercentile([], 0.5)).toBeNull();
  });

  it("returns the only value of a one-value list for any percentile", () => {
    expect(nearestRankPercentile([42], 0.5)).toBe(42);
    expect(nearestRankPercentile([42], 0.95)).toBe(42);
  });

  it("takes the middle value of an odd count as the median", () => {
    expect(nearestRankPercentile([30, 10, 20], 0.5)).toBe(20);
  });

  it("takes the lower middle value of an even count as the median", () => {
    expect(nearestRankPercentile([40, 10, 30, 20], 0.5)).toBe(20);
  });

  it("takes the 19th of 20 values and the 95th of 100 values as the 95th percentile", () => {
    expect(nearestRankPercentile(range(20), 0.95)).toBe(19);
    expect(nearestRankPercentile(range(100), 0.95)).toBe(95);
  });
});
