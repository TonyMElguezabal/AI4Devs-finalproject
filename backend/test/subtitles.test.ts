import { describe, expect, it } from "vitest";
import type { NarrationEdit } from "../src/assemblyTool.ts";
import type { TimestampCharacter } from "../src/narrationTimestamps.ts";
import { assTime, buildSubtitleCues, MAX_LINE_CHARACTERS, renderAss, shiftTime, SUBTITLE_STYLE, type SubtitleCue } from "../src/subtitles.ts";

// add-burned-in-subtitles (JOS-237), groups 2 and 3 — design Decisions 1 and 2.

const EXAMPLE_SCRIPT =
  "Daniel doesn't need this 401k to last forever. He needs it to bridge him. 55 to 59 and a half: Rule of 55 401k withdrawals, penalty-free. 59 and a half to 62: any retirement money now, no penalty. ";

/** One entry per spoken character, `perChar` seconds each; `gaps[i]` adds silence before the i-th spoken character. */
function charactersFor(
  script: string,
  options: { perChar?: number; includeWhitespace?: boolean; gaps?: Record<number, number> } = {},
): TimestampCharacter[] {
  const { perChar = 0.1, includeWhitespace = false, gaps = {} } = options;
  const characters: TimestampCharacter[] = [];
  let clock = 0;
  let spoken = 0;
  for (const text of script) {
    if (/\s/u.test(text)) {
      if (includeWhitespace) characters.push({ text, start: clock, end: clock });
      continue;
    }
    clock += gaps[spoken] ?? 0;
    characters.push({ text, start: clock, end: clock + perChar });
    clock += perChar;
    spoken += 1;
  }
  return characters;
}

const cuesFor = (script: string, edits: readonly NarrationEdit[] = [], videoSeconds = 1000, options?: Parameters<typeof charactersFor>[1]): SubtitleCue[] =>
  buildSubtitleCues(script, charactersFor(script, options), edits, videoSeconds);

const textOf = (cue: SubtitleCue): string => cue.words.map((word) => word.text).join(" ");

describe("shiftTime (design Decision 2)", () => {
  it("leaves every time alone with no edits", () => {
    expect(shiftTime(5, [])).toBe(5);
  });

  it("ignores an edit of zero seconds", () => {
    expect(shiftTime(7, [{ atSeconds: 5, deltaSeconds: 0 }])).toBe(7);
  });

  it("moves a time at or after an insertion later by its length, and leaves an earlier one", () => {
    const edits = [{ atSeconds: 5, deltaSeconds: 0.5 }];
    expect(shiftTime(4.9, edits)).toBeCloseTo(4.9, 9);
    expect(shiftTime(5, edits)).toBeCloseTo(5.5, 9);
    expect(shiftTime(6, edits)).toBeCloseTo(6.5, 9);
  });

  it("moves a time after a removal earlier by its length, and leaves a time before it", () => {
    const edits = [{ atSeconds: 5, deltaSeconds: -0.6 }]; // cuts [4.7, 5.3]
    expect(shiftTime(4.6, edits)).toBeCloseTo(4.6, 9);
    expect(shiftTime(5.3, edits)).toBeCloseTo(4.7, 9);
    expect(shiftTime(6, edits)).toBeCloseTo(5.4, 9);
  });

  it("moves a time inside a removal to where the removal begins", () => {
    const edits = [{ atSeconds: 5, deltaSeconds: -0.6 }];
    expect(shiftTime(4.7, edits)).toBeCloseTo(4.7, 9);
    expect(shiftTime(4.9, edits)).toBeCloseTo(4.7, 9);
    expect(shiftTime(5, edits)).toBeCloseTo(4.7, 9);
    expect(shiftTime(5.2, edits)).toBeCloseTo(4.7, 9);
  });

  it("adds up several edits, whatever order they are given in", () => {
    const edits = [
      { atSeconds: 10, deltaSeconds: 1 },
      { atSeconds: 5, deltaSeconds: -0.6 },
    ];
    expect(shiftTime(3, edits)).toBeCloseTo(3, 9);
    expect(shiftTime(9, edits)).toBeCloseTo(8.4, 9);
    expect(shiftTime(10, edits)).toBeCloseTo(10.4, 9);
    expect(shiftTime(11, edits)).toBeCloseTo(11.4, 9);
  });

  it("puts a time inside a removal after the shifts that come before it", () => {
    const edits = [
      { atSeconds: 2, deltaSeconds: 1 },
      { atSeconds: 5, deltaSeconds: -0.6 },
    ];
    expect(shiftTime(5, edits)).toBeCloseTo(5.7, 9); // cut starts at 4.7, plus the 1 s inserted earlier
  });
});

describe("buildSubtitleCues: words (design Decision 1)", () => {
  it("starts each word at its first spoken character", () => {
    const [cue] = cuesFor("Hello big world.");
    expect(cue!.words.map((word) => word.text)).toEqual(["Hello", "big", "world."]);
    expect(cue!.words[0]!.startSeconds).toBeCloseTo(0, 9);
    expect(cue!.words[1]!.startSeconds).toBeCloseTo(0.5, 9); // "Hello" is 5 characters
    expect(cue!.words[2]!.startSeconds).toBeCloseTo(0.8, 9); // "big" is 3 more
  });

  it("gives the same words whether or not the timestamps carry whitespace entries", () => {
    const withoutSpaces = cuesFor("Hello big world.");
    const withSpaces = cuesFor("Hello big world.", [], 1000, { includeWhitespace: true });
    expect(withSpaces).toEqual(withoutSpaces);
  });

  it("is not thrown off by repeated spaces and newlines in the script", () => {
    const [cue] = cuesFor("Hello  big\n\nworld.");
    expect(cue!.words.map((word) => word.text)).toEqual(["Hello", "big", "world."]);
    expect(cue!.words[2]!.startSeconds).toBeCloseTo(0.8, 9);
  });

  it("reflects silence between words in the next word's start", () => {
    const [cue] = cuesFor("Hello big world.", [], 1000, { gaps: { 5: 0.7 } }); // 0.7 s before "big"
    expect(cue!.words[1]!.startSeconds).toBeCloseTo(1.2, 9);
  });

  it("refuses characters that do not match the script", () => {
    expect(() => buildSubtitleCues("Hello big world.", charactersFor("Something else."), [], 1000)).toThrow(/do not match/);
  });

  it("keeps a number with its punctuation as one word", () => {
    const [cue] = cuesFor("at 50 with 600,000");
    expect(cue!.words.map((word) => word.text)).toEqual(["at", "50", "with", "600,000"]);
  });
});

describe("buildSubtitleCues: lines (design Decision 1)", () => {
  it("never makes a line longer than the limit, and never splits or loses a word", () => {
    const cues = cuesFor(EXAMPLE_SCRIPT);
    for (const cue of cues) expect(textOf(cue).length).toBeLessThanOrEqual(MAX_LINE_CHARACTERS);
    expect(cues.flatMap((cue) => cue.words.map((word) => word.text))).toEqual(EXAMPLE_SCRIPT.trim().split(/\s+/));
    expect(cues.flatMap((cue) => cue.words)).toHaveLength(38);
  });

  it("ends a line at the end of a sentence even when the next sentence would fit", () => {
    expect(cuesFor("Hi there. Bye now.").map(textOf)).toEqual(["Hi there.", "Bye now."]);
  });

  it("treats ? ! and … as sentence ends, and a closing quote after them as part of the same word", () => {
    expect(cuesFor('Why? Go! Well… "Done."').map(textOf)).toEqual(["Why?", "Go!", "Well…", '"Done."']);
  });

  it("prefers to break after a comma when the line overflows", () => {
    const [first, second] = cuesFor("The quick brown fox, jumps over the lazy dog today");
    expect(textOf(first!)).toBe("The quick brown fox,");
    expect(textOf(second!)).toBe("jumps over the lazy dog today");
  });

  it("ignores a comma that would leave a very short line", () => {
    const [first] = cuesFor("Yes, we absolutely definitely wonderful always");
    expect(textOf(first!)).toBe("Yes, we absolutely definitely");
  });

  it("keeps a word longer than a line whole, on a line of its own", () => {
    const long = "supercalifragilisticexpialidocious-and-more";
    expect(cuesFor(`short ${long} tail`).map(textOf)).toEqual(["short", long, "tail"]);
  });

  it("keeps accents and Spanish punctuation intact", () => {
    expect(cuesFor("¿Qué más? ¡Sí! Está bien.").map(textOf)).toEqual(["¿Qué más?", "¡Sí!", "Está bien."]);
  });

  it("returns no cue for a script with no words", () => {
    expect(buildSubtitleCues("   ", [], [], 10)).toEqual([]);
  });
});

describe("buildSubtitleCues: line timing (design Decision 1)", () => {
  const TWO_SENTENCES = "Hello big world. Next one here."; // 14 then 12 spoken characters, 0.1 s each

  it("ends a line when the next one starts if they follow each other directly", () => {
    const [first, second] = cuesFor(TWO_SENTENCES, [], 3);
    expect(first!.startSeconds).toBeCloseTo(0, 9);
    expect(first!.endSeconds).toBeCloseTo(1.4, 9);
    expect(second!.startSeconds).toBeCloseTo(1.4, 9);
  });

  it("keeps a line on screen 0.5 s after its last character when the next one starts later", () => {
    const [first, second] = cuesFor(TWO_SENTENCES, [], 100, { gaps: { 14: 2 } }); // 2 s of silence before "Next"
    expect(first!.endSeconds).toBeCloseTo(1.9, 9);
    expect(second!.startSeconds).toBeCloseTo(3.4, 9);
  });

  it("holds a very short line for at least 0.7 s when the next line allows it", () => {
    const [first] = cuesFor("Hi. Go on now.", [], 100, { perChar: 0.05, gaps: { 3: 1 } });
    expect(first!.endSeconds - first!.startSeconds).toBeCloseTo(0.7, 9);
  });

  it("lets the next line cut a very short line off, never the other way round", () => {
    const [first, second] = cuesFor("Hi. Go on now.", [], 100, { perChar: 0.05 });
    expect(first!.endSeconds).toBeCloseTo(second!.startSeconds, 9);
    expect(first!.endSeconds - first!.startSeconds).toBeLessThan(0.7);
  });

  it("ends the last line 0.5 s after its last character, but never after the video", () => {
    const natural = cuesFor(TWO_SENTENCES, [], 100);
    expect(natural[1]!.endSeconds).toBeCloseTo(3.1, 9);
    const capped = cuesFor(TWO_SENTENCES, [], 2);
    expect(capped[1]!.endSeconds).toBeCloseTo(2, 9);
  });

  it("never lets two lines overlap", () => {
    const cues = cuesFor(EXAMPLE_SCRIPT, [], 1000, { gaps: { 20: 0.3, 60: 1.5 } });
    for (let index = 1; index < cues.length; index++) {
      expect(cues[index - 1]!.endSeconds).toBeLessThanOrEqual(cues[index]!.startSeconds + 1e-9);
    }
  });

  it("moves every time by an inserted silence, after the pause it was inserted in", () => {
    const options = { gaps: { 14: 1 } }; // silence from 1.4 s to 2.4 s
    const [first, second] = cuesFor(TWO_SENTENCES, [{ atSeconds: 1.9, deltaSeconds: 0.5 }], 100, options);
    expect(first!.startSeconds).toBeCloseTo(0, 9);
    expect(first!.endSeconds).toBeCloseTo(1.9, 9);
    expect(second!.startSeconds).toBeCloseTo(2.9, 9); // was 2.4
    expect(second!.words[1]!.startSeconds).toBeCloseTo(3.3, 9); // was 2.8
  });

  it("moves every time earlier by a removed silence", () => {
    const options = { gaps: { 14: 1 } };
    const [first, second] = cuesFor(TWO_SENTENCES, [{ atSeconds: 1.9, deltaSeconds: -0.6 }], 100, options);
    expect(second!.startSeconds).toBeCloseTo(1.8, 9); // was 2.4
    expect(first!.endSeconds).toBeLessThanOrEqual(second!.startSeconds + 1e-9);
  });

  it("uses the stored times when there are no edits", () => {
    const options = { gaps: { 14: 1 } };
    expect(cuesFor(TWO_SENTENCES, [], 100, options)).toEqual(cuesFor(TWO_SENTENCES, [{ atSeconds: 1.9, deltaSeconds: 0 }], 100, options));
  });
});

describe("assTime", () => {
  it("formats h:mm:ss.cc with centiseconds", () => {
    expect(assTime(0)).toBe("0:00:00.00");
    expect(assTime(1.5)).toBe("0:00:01.50");
    expect(assTime(3725.456)).toBe("1:02:05.46");
  });

  it("carries a rounded-up centisecond into the next second", () => {
    expect(assTime(59.999)).toBe("0:01:00.00");
  });
});

describe("renderAss (design Decisions 1 and 4)", () => {
  const PINK_OPEN = "{\\c&HD0CDFF&}";
  const WHITE_AGAIN = "{\\c&HFFFFFF&}";
  const cue = (words: Array<[string, number]>, startSeconds: number, endSeconds: number): SubtitleCue => ({
    startSeconds,
    endSeconds,
    words: words.map(([text, start]) => ({ text, startSeconds: start })),
  });
  const dialogues = (ass: string): string[] => ass.split("\n").filter((line) => line.startsWith("Dialogue:"));
  /** The Text field: everything after the ninth comma (Text may itself contain commas). */
  const textField = (line: string): string => line.split(",").slice(9).join(",");
  const timesOf = (line: string): [string, string] => {
    const [, start, end] = line.slice("Dialogue: ".length).split(",");
    return [start!, end!];
  };

  it("writes the script info and the style for a 1920x1080 frame, with no automatic wrapping", () => {
    const ass = renderAss([]);
    expect(ass).toContain("PlayResX: 1920");
    expect(ass).toContain("PlayResY: 1080");
    expect(ass).toContain("WrapStyle: 2");
    expect(ass).toContain("ScaledBorderAndShadow: yes");
    expect(ass).toContain(
      "Style: Default,Montserrat,75,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,3,0,2,60,60,80,1",
    );
    expect(SUBTITLE_STYLE.fontSize).toBe(75);
  });

  it("gives every Dialogue as many fields as its Format line, and every Style as many as its Format", () => {
    const ass = renderAss([cue([["a", 1], ["b", 2]], 1, 3)]);
    const lines = ass.split("\n");
    const eventFormat = lines.find((line) => line.startsWith("Format: Layer"))!.slice("Format: ".length).split(",");
    expect(eventFormat).toHaveLength(10);
    for (const line of dialogues(ass)) expect(line.slice("Dialogue: ".length).split(",").length).toBeGreaterThanOrEqual(eventFormat.length);
    const styleFormat = lines.find((line) => line.startsWith("Format: Name"))!.slice("Format: ".length).split(",");
    const style = lines.find((line) => line.startsWith("Style:"))!.slice("Style: ".length).split(",");
    expect(style).toHaveLength(styleFormat.length);
    // Text is the tenth field: the line before it carries exactly the nine other values.
    expect(dialogues(ass)[0]!.startsWith("Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,")).toBe(true);
  });

  it("writes one event per word, each ending where the next word starts, the last at the line's end", () => {
    const ass = renderAss([cue([["a", 1], ["b", 1.5], ["c", 2.5]], 1, 3)]);
    const events = dialogues(ass);
    expect(events).toHaveLength(3);
    expect(events.map(timesOf)).toEqual([
      ["0:00:01.00", "0:00:01.50"],
      ["0:00:01.50", "0:00:02.50"],
      ["0:00:02.50", "0:00:03.00"],
    ]);
    expect(events.map(textField)).toEqual([
      `${PINK_OPEN}a${WHITE_AGAIN} b c`,
      `a ${PINK_OPEN}b${WHITE_AGAIN} c`,
      `a b ${PINK_OPEN}c${WHITE_AGAIN}`,
    ]);
  });

  it("highlights exactly one word in every event", () => {
    const ass = renderAss([cue([["at", 0], ["50", 0.4], ["with", 0.8], ["600,000", 1.2]], 0, 2)]);
    for (const line of dialogues(ass)) expect(textField(line).split("&HD0CDFF&")).toHaveLength(2);
  });

  it("keeps the earlier word highlighted across a silence, until the next word starts", () => {
    const ass = renderAss([cue([["a", 1], ["b", 4]], 1, 5)]);
    expect(timesOf(dialogues(ass)[0]!)).toEqual(["0:00:01.00", "0:00:04.00"]);
  });

  it("drops an event that would last no time, and one that starts after the line has ended", () => {
    const sameTime = renderAss([cue([["a", 1], ["b", 1.5], ["c", 1.5]], 1, 3)]);
    expect(dialogues(sameTime)).toHaveLength(2);
    const afterEnd = renderAss([cue([["a", 1], ["b", 3.2]], 1, 3)]);
    expect(dialogues(afterEnd)).toHaveLength(1);
    expect(timesOf(dialogues(afterEnd)[0]!)).toEqual(["0:00:01.00", "0:00:03.00"]);
  });

  it("escapes braces and backslashes so a script cannot restyle or hide its own subtitles", () => {
    const ass = renderAss([cue([["x{\\an8}y", 1], ["back\\Nslash", 2]], 1, 3)]);
    const texts = dialogues(ass).map(textField);
    expect(texts[0]).toContain("x\\{\\\u200Ban8\\}y"); // { and } escaped; the backslash can no longer start a tag
    expect(texts[1]).toContain("back\\\u200BNslash"); // \N can no longer be a line break
    for (const text of texts) {
      const withoutOverrides = text.split(PINK_OPEN).join("").split(WHITE_AGAIN).join("");
      expect(withoutOverrides.replace(/\\[{}]/g, "")).not.toMatch(/[{}]/);
    }
  });

  it("keeps accents and Spanish punctuation as they are", () => {
    const ass = renderAss([cue([["¿Qué", 0], ["más?", 0.5]], 0, 1)]);
    expect(ass).toContain("¿Qué");
    expect(ass).toContain("más?");
  });

  it("writes nothing but the header for no cues", () => {
    expect(dialogues(renderAss([]))).toEqual([]);
  });
});
