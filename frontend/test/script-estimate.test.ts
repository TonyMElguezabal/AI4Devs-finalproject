import { describe, expect, it } from "vitest";
import { estimateScript, formatEstimate } from "../src/scriptEstimate";

const EXAMPLE_SCRIPT =
  "Daniel doesn't need this 401k to last forever. He needs it to bridge him. 55 to 59 and a half: Rule of 55 401k withdrawals, penalty-free. 59 and a half to 62: any retirement money now, no penalty. ";

const words = (count: number): string => Array.from({ length: count }, () => "word").join(" ");

describe("estimateScript (JOS-236)", () => {
  it("returns null for an empty or whitespace-only script", () => {
    expect(estimateScript("")).toBeNull();
    expect(estimateScript("   \n\t")).toBeNull();
  });

  it("counts one word as 0 seconds", () => {
    expect(estimateScript("Hello")).toEqual({ words: 1, seconds: 0 });
  });

  it("counts the ticket's example as 38 words and 15 seconds", () => {
    expect(estimateScript(EXAMPLE_SCRIPT)).toEqual({ words: 38, seconds: 15 });
  });

  it("estimates 150 words as one minute", () => {
    expect(estimateScript(words(150))).toEqual({ words: 150, seconds: 60 });
  });

  it("ignores leading, trailing and repeated whitespace and newlines", () => {
    expect(estimateScript("  one   two\n\nthree \t")?.words).toBe(3);
  });
});

describe("formatEstimate (JOS-236)", () => {
  it("uses the singular for one word", () => {
    expect(formatEstimate({ words: 1, seconds: 0 })).toBe("1 word · Estimated video duration ~0:00");
  });

  it("formats seconds as ~m:ss", () => {
    expect(formatEstimate({ words: 38, seconds: 15 })).toBe("38 words · Estimated video duration ~0:15");
    expect(formatEstimate(estimateScript(words(1500))!)).toBe("1500 words · Estimated video duration ~10:00");
    expect(formatEstimate(estimateScript(words(1875))!)).toBe("1875 words · Estimated video duration ~12:30");
  });
});
