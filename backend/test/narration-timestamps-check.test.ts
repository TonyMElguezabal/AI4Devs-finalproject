import { describe, expect, it } from "vitest";
import {
  checkTimestamps,
  parseAlignedCharacters,
  parseNativeTimestamps,
  type TimestampCharacter,
} from "../src/narrationTimestamps.ts";

// obtain-narration-timestamps (JOS-139), group 3 — design Decision 3: both
// provider shapes are parsed into one per-character form, and "usable" is the
// same check for both, on that form.

const SCRIPT = "Hi there.";

/** One timestamp per character, 0.1 s each, starting at 0. */
function charactersFor(text: string, options: { step?: number; offset?: number } = {}): TimestampCharacter[] {
  const step = options.step ?? 0.1;
  const offset = options.offset ?? 0;
  return [...text].map((character, index) => ({
    text: character,
    start: offset + index * step,
    end: offset + (index + 1) * step,
  }));
}

describe("Parsing the voice provider's native timestamps (parallel arrays)", () => {
  const native = {
    characters: ["H", "i"],
    character_start_times_seconds: [0, 0.1],
    character_end_times_seconds: [0.1, 0.2],
  };

  it("accepts the alignment object inside a full response", () => {
    expect(parseNativeTimestamps({ audio_base64: "x", alignment: native })).toEqual({
      ok: true,
      characters: [
        { text: "H", start: 0, end: 0.1 },
        { text: "i", start: 0.1, end: 0.2 },
      ],
    });
  });

  it("accepts the alignment object on its own", () => {
    expect(parseNativeTimestamps(native)).toMatchObject({ ok: true });
  });

  it.each([
    ["arrays of different lengths", { ...native, character_end_times_seconds: [0.1] }],
    ["a missing array", { characters: ["H"], character_start_times_seconds: [0] }],
    ["non-numeric times", { ...native, character_start_times_seconds: ["a", "b"] }],
    ["a string instead of an object", "not timestamps"],
    ["null", null],
    ["an empty object", {}],
  ])("rejects %s", (_label, raw) => {
    expect(parseNativeTimestamps(raw)).toMatchObject({ ok: false });
  });
});

describe("Parsing the forced-alignment response (a list of characters)", () => {
  it("accepts characters with text, start and end, ignoring extra fields", () => {
    const raw = {
      characters: [
        { text: "H", start: 0.1, end: 0.2, loss: 0.01 },
        { text: "i", start: 0.2, end: 0.3 },
      ],
      words: [{ text: "Hi", start: 0.1, end: 0.3, loss: 0.02 }],
      loss: 0.5,
    };
    expect(parseAlignedCharacters(raw)).toEqual({
      ok: true,
      characters: [
        { text: "H", start: 0.1, end: 0.2 },
        { text: "i", start: 0.2, end: 0.3 },
      ],
    });
  });

  it.each([
    ["a character without an end", { characters: [{ text: "H", start: 0 }] }],
    ["no characters key", { words: [] }],
    ["characters that are not objects", { characters: ["H", "i"] }],
    ["null", null],
  ])("rejects %s", (_label, raw) => {
    expect(parseAlignedCharacters(raw)).toMatchObject({ ok: false });
  });
});

describe("What makes timestamps usable (Decision 3)", () => {
  const DURATION = 0.9;

  it("accepts characters that reproduce the script with valid, ordered times", () => {
    expect(checkTimestamps(charactersFor(SCRIPT), SCRIPT, DURATION, "exact")).toEqual({ usable: true });
  });

  it("allows gaps between characters (partitioning the audio is not this step's job)", () => {
    const withGaps = charactersFor(SCRIPT, { step: 0.05 }).map((c, i) => ({ ...c, start: c.start + i * 0.02, end: c.end + i * 0.02 }));
    expect(checkTimestamps(withGaps, SCRIPT, DURATION, "exact")).toEqual({ usable: true });
  });

  it("accepts a last end up to half a second past the duration", () => {
    expect(checkTimestamps(charactersFor(SCRIPT), SCRIPT, 0.4, "exact")).toEqual({ usable: true });
  });

  it("does not need the first character to start at 0 (forced alignment starts at about 0.1 s)", () => {
    expect(checkTimestamps(charactersFor(SCRIPT, { offset: 0.1 }), SCRIPT, 1.0, "exact")).toEqual({ usable: true });
  });

  it.each<[string, TimestampCharacter[], number]>([
    ["an empty list", [], 5],
    ["a character ending before it starts", [{ text: "H", start: 0.2, end: 0.1 }, ...charactersFor("i.", { offset: 0.3 })], 5],
    ["a negative time", [{ text: "H", start: -0.1, end: 0.1 }, ...charactersFor("i", { offset: 0.1 })], 5],
    ["a non-finite time", [{ text: "H", start: 0, end: Number.NaN }], 5],
    ["starts going backwards", [{ text: "H", start: 0.5, end: 0.6 }, { text: "i", start: 0.1, end: 0.2 }], 5],
    ["an end beyond the duration plus half a second", charactersFor("Hi there.", { step: 1 }), 5],
  ])("rejects %s", (_label, characters, duration) => {
    const script = characters.map((c) => c.text).join("") || SCRIPT;
    expect(checkTimestamps(characters, script, duration, "exact")).toMatchObject({ usable: false });
  });

  it("gives a reason that names what is wrong", () => {
    const result = checkTimestamps(charactersFor("Hi there!"), SCRIPT, DURATION, "exact");
    expect(result).toEqual({ usable: false, reason: expect.stringMatching(/script/i) });
  });
});

describe("Matching the script (Decision 3)", () => {
  it("requires native timestamps to reproduce the script exactly, whitespace included", () => {
    const withoutSpace = charactersFor("Hithere.");
    expect(checkTimestamps(withoutSpace, SCRIPT, 5, "exact")).toMatchObject({ usable: false });
  });

  it("lets forced alignment differ from the script in whitespace only", () => {
    expect(checkTimestamps(charactersFor("Hithere."), SCRIPT, 5, "ignore-whitespace")).toEqual({ usable: true });
    expect(checkTimestamps(charactersFor("Hi  there.\n"), SCRIPT, 5, "ignore-whitespace")).toEqual({ usable: true });
  });

  it("still rejects forced alignment whose letters differ from the script", () => {
    expect(checkTimestamps(charactersFor("Hi where."), SCRIPT, 5, "ignore-whitespace")).toMatchObject({ usable: false });
  });

  it("compares the script as it was stored, without trimming or normalising it", () => {
    const script = "  Hi there.  ";
    expect(checkTimestamps(charactersFor("Hi there."), script, 5, "exact")).toMatchObject({ usable: false });
    expect(checkTimestamps(charactersFor(script), script, 5, "exact")).toEqual({ usable: true });
  });
});
