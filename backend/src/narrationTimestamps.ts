import { z } from "zod";

// obtain-narration-timestamps (JOS-139) Decision 3 — both providers' timestamps
// are parsed into ONE per-character form, and "usable" is the same check for
// both (PRD §5 step 3, §11.1). This module is pure: no I/O, no providers.

/** One character of the script and where the narration says it. */
export interface TimestampCharacter {
  text: string;
  start: number;
  end: number;
}

export type ParseResult = { ok: true; characters: TimestampCharacter[] } | { ok: false; reason: string };

/** ElevenLabs `/with-timestamps`: parallel arrays, one entry per character sent. */
const nativeAlignmentSchema = z.object({
  characters: z.array(z.string()),
  character_start_times_seconds: z.array(z.number()),
  character_end_times_seconds: z.array(z.number()),
});

/** The stored raw file is either the whole response, holding an `alignment` object, or that object on its own. */
const nativeTimestampsSchema = z.union([z.object({ alignment: nativeAlignmentSchema }).passthrough(), nativeAlignmentSchema]);

export function parseNativeTimestamps(raw: unknown): ParseResult {
  const parsed = nativeTimestampsSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "the native timestamps do not have the expected shape" };
  const alignment = "alignment" in parsed.data ? parsed.data.alignment : parsed.data;
  const { characters, character_start_times_seconds: starts, character_end_times_seconds: ends } = alignment;
  if (characters.length !== starts.length || characters.length !== ends.length) {
    return { ok: false, reason: "the native timestamps have arrays of different lengths" };
  }
  return { ok: true, characters: characters.map((text, index) => ({ text, start: starts[index]!, end: ends[index]! })) };
}

/** ElevenLabs `/v1/forced-alignment`: a list of characters; extra fields (loss, words) are ignored. */
const alignedResponseSchema = z.object({
  characters: z.array(z.object({ text: z.string(), start: z.number(), end: z.number() })),
});

export function parseAlignedCharacters(raw: unknown): ParseResult {
  const parsed = alignedResponseSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "the forced-alignment response does not have the expected shape" };
  return {
    ok: true,
    characters: parsed.data.characters.map(({ text, start, end }) => ({ text, start, end })),
  };
}

export type UsabilityResult = { usable: true } | { usable: false; reason: string };

/** How far past the MP3's measured duration the last character may end (encoder padding, rounding). */
const DURATION_TOLERANCE_SECONDS = 0.5;

const withoutWhitespace = (text: string): string => text.replace(/\s+/g, "");

/**
 * Decision 3 — usable means: at least one character; the characters joined
 * reproduce the locked script (`exact` for native timestamps, since the script
 * was sent unaltered; `ignore-whitespace` for forced alignment, which may
 * normalise it); every time is finite and non-negative; a character ends no
 * earlier than it starts; starts never go backwards; and the last end is within
 * the MP3's duration plus half a second. Gaps between characters are allowed:
 * turning timestamps into a gapless partition is JOS-143's job.
 */
export function checkTimestamps(
  characters: readonly TimestampCharacter[],
  script: string,
  durationSeconds: number,
  match: "exact" | "ignore-whitespace",
): UsabilityResult {
  if (characters.length === 0) return { usable: false, reason: "there are no timestamps" };

  const joined = characters.map((character) => character.text).join("");
  const matches = match === "exact" ? joined === script : withoutWhitespace(joined) === withoutWhitespace(script);
  if (!matches) return { usable: false, reason: "the timestamps' characters do not reproduce the script" };

  let previousStart = 0;
  for (const [index, { start, end }] of characters.entries()) {
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      return { usable: false, reason: `character ${index + 1} has a time that is not a number` };
    }
    if (start < 0 || end < 0) return { usable: false, reason: `character ${index + 1} has a negative time` };
    if (end < start) return { usable: false, reason: `character ${index + 1} ends before it starts` };
    if (start < previousStart) return { usable: false, reason: `character ${index + 1} starts before the one before it` };
    previousStart = start;
  }

  const lastEnd = characters[characters.length - 1]!.end;
  if (lastEnd > durationSeconds + DURATION_TOLERANCE_SECONDS) {
    return { usable: false, reason: `the last character ends at ${lastEnd} s, beyond the ${durationSeconds} s narration` };
  }
  return { usable: true };
}
