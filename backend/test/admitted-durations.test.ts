import { describe, expect, it } from "vitest";
import { VIDEO_ADMITTED_DURATIONS_SECONDS, VIDEO_ADMITTED_DURATION_SECONDS } from "../src/config/providers.ts";
import { closestAdmittedDuration } from "../src/admittedDurations.ts";

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
});
