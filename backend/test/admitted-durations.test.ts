import { describe, expect, it } from "vitest";
import { VIDEO_ADMITTED_DURATIONS_SECONDS, VIDEO_ADMITTED_DURATION_SECONDS } from "../src/config/providers.ts";
import { closestAdmittedDuration, requestedClipDuration } from "../src/admittedDurations.ts";

// segment-script-into-chunks (JOS-140), group 2 — design Decision 6 and PRD
// §7.2: the admitted clip durations, and "closest" defined as the smallest
// speed change (the ratio), not the fewest seconds, an exact tie going to the
// longer duration.

describe("The admitted durations (Decision 6)", () => {
  it("are the whole seconds from the recorded minimum to the recorded maximum", () => {
    expect(VIDEO_ADMITTED_DURATIONS_SECONDS).toEqual([5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
  });

  it("are derived from the one recorded range, so they cannot drift from it", () => {
    const { min, max } = VIDEO_ADMITTED_DURATION_SECONDS;
    expect(VIDEO_ADMITTED_DURATIONS_SECONDS[0]).toBe(min);
    expect(VIDEO_ADMITTED_DURATIONS_SECONDS.at(-1)).toBe(max);
    expect(VIDEO_ADMITTED_DURATIONS_SECONDS).toHaveLength(max - min + 1);
  });
});

describe("The closest admitted duration (PRD §7.2)", () => {
  it("returns the duration itself, with no speed change, when it is admitted", () => {
    expect(closestAdmittedDuration(8)).toEqual({ admitted: 8, speedRatio: 1 });
  });

  it("picks the admitted duration needing the smaller speed change", () => {
    const result = closestAdmittedDuration(9.4);
    expect(result.admitted).toBe(9);
    expect(result.speedRatio).toBeCloseTo(9.4 / 9, 10);
  });

  it("measures a slow-down as admitted over narrated and a speed-up as narrated over admitted", () => {
    // 12.5 s: 12 s needs a 12.5/12 speed-up (1.0417); 13 s needs a 13/12.5 slow-down (1.04).
    const result = closestAdmittedDuration(12.5);
    expect(result.admitted).toBe(13);
    expect(result.speedRatio).toBeCloseTo(13 / 12.5, 10);
  });

  it("compares by ratio and not by seconds", () => {
    // 7.5 s is 0.5 s from both 7 and 8, a tie by seconds. By ratio, 7 needs 7.5/7 = 1.0714 and 8 needs 8/7.5 = 1.0667, so 8 wins.
    const result = closestAdmittedDuration(7.5);
    expect(result.admitted).toBe(8);
    expect(result.speedRatio).toBeCloseTo(8 / 7.5, 10);
  });

  it("gives an exact tie to the longer duration", () => {
    // sqrt(90) is the narrated length at which 9 s and 10 s need exactly the same ratio.
    const result = closestAdmittedDuration(Math.sqrt(90));
    expect(result.admitted).toBe(10);
    expect(result.speedRatio).toBeCloseTo(10 / Math.sqrt(90), 10);
  });

  it("gives the shortest admitted duration for a narration below it", () => {
    const result = closestAdmittedDuration(3);
    expect(result.admitted).toBe(5);
    expect(result.speedRatio).toBeCloseTo(5 / 3, 10);
  });

  it("gives the longest admitted duration for a narration above it", () => {
    const result = closestAdmittedDuration(20);
    expect(result.admitted).toBe(15);
    expect(result.speedRatio).toBeCloseTo(20 / 15, 10);
  });

  it("never returns a ratio below 1", () => {
    for (let narrated = 1; narrated <= 30; narrated += 0.37) {
      expect(closestAdmittedDuration(narrated).speedRatio).toBeGreaterThanOrEqual(1);
    }
  });

  it("is deterministic", () => {
    expect(closestAdmittedDuration(11.3)).toEqual(closestAdmittedDuration(11.3));
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])("refuses a narrated duration of %s", (narrated) => {
    expect(() => closestAdmittedDuration(narrated)).toThrow(RangeError);
  });

  it("accepts an explicit admitted-durations list, scoring against it instead of the default", () => {
    // With 5-20, 17.4 s is closest to 17 (ratio 17.4/17 = 1.0235), not 15.
    const result = closestAdmittedDuration(17.4, [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    expect(result.admitted).toBe(17);
  });

  it("defaults to the recorded admitted set when no explicit list is given", () => {
    expect(closestAdmittedDuration(9.4, VIDEO_ADMITTED_DURATIONS_SECONDS)).toEqual(closestAdmittedDuration(9.4));
  });
});

describe("requestedClipDuration (request-admitted-clip-duration, JOS-147)", () => {
  it("picks the admitted duration by smallest speed change, not fewest seconds", () => {
    // 5.49 s: 5 s needs 5.49/5 = 1.098; 6 s needs 6/5.49 = 1.093. 6 wins despite being farther in seconds.
    const result = requestedClipDuration({ startSeconds: 0, endSeconds: 5.49 });
    expect(result).toEqual({ seconds: 6, warning: null });
  });

  it("picks a shorter admitted duration when it is closer", () => {
    const result = requestedClipDuration({ startSeconds: 0, endSeconds: 9.4 });
    expect(result).toEqual({ seconds: 9, warning: null });
  });

  it("gives an exact tie to the longer duration", () => {
    const result = requestedClipDuration({ startSeconds: 0, endSeconds: Math.sqrt(30) });
    expect(result).toEqual({ seconds: 6, warning: null });
  });

  it("requests the smallest admitted duration below the minimum, with no warning", () => {
    const result = requestedClipDuration({ startSeconds: 0, endSeconds: 3.2 });
    expect(result).toEqual({ seconds: 5, warning: null });
  });

  it("requests the maximum at exactly the maximum, with no warning", () => {
    const result = requestedClipDuration({ startSeconds: 0, endSeconds: 15 });
    expect(result).toEqual({ seconds: 15, warning: null });
  });

  it("requests the maximum with exceeds-maximum above it (an unsplittable sentence)", () => {
    const result = requestedClipDuration({ startSeconds: 0, endSeconds: 17.4 });
    expect(result).toEqual({ seconds: 15, warning: "exceeds-maximum" });
  });

  it("derives the narrated duration from the interval, not a precomputed value", () => {
    expect(requestedClipDuration({ startSeconds: 100, endSeconds: 105.49 })).toEqual({ seconds: 6, warning: null });
  });

  it("scores against an explicit admitted list when given one", () => {
    const wide = Array.from({ length: 16 }, (_, i) => 5 + i); // 5..20
    const result = requestedClipDuration({ startSeconds: 0, endSeconds: 17.4 }, wide);
    expect(result).toEqual({ seconds: 17, warning: null });
  });
});
