// Turns character timestamps into sentence speech spans and per-unit narrated
// durations (segment-script-into-chunks, design Decisions 2 and 3;
// decide-silence-allocation, JOS-142, D11).
//
// Decision 2: characters are matched to the script by position, ignoring
// whitespace — forced alignment may not return entries for it.
// D11 (product owner decision, 2026-09-29): the boundary between two adjacent
// units is the start of the following unit's speech, so the previous scene
// absorbs the silence that follows it; the first boundary is 0 and the last
// is the MP3's duration. Chosen over splitting the silence between the two
// scenes (JOS-140's interim rule) because the product owner judged, from a
// rendered comparison of real narration, that the image and the words it
// illustrates should begin together — a cut mid-silence let the next scene's
// image appear before its narration started.

import type { Sentence } from "./sentences.ts";
import type { TimestampCharacter } from "./narrationTimestamps.ts";

export interface SpeechSpan {
  start: number;
  end: number;
}

const isWhitespace = (character: string): boolean => /\s/u.test(character);

/** The start/end, in seconds, of the speech of each sentence. */
export function sentenceSpeechSpans(
  script: string,
  sentences: readonly Sentence[],
  characters: readonly TimestampCharacter[],
): SpeechSpan[] {
  // Script offset → index among the spoken (non-whitespace) characters.
  const spokenIndexAtOffset = new Map<number, number>();
  let spokenCount = 0;
  let offset = 0;
  for (const character of script) {
    if (!isWhitespace(character)) spokenIndexAtOffset.set(offset, spokenCount++);
    offset += character.length;
  }

  const spoken = characters.filter((entry) => !isWhitespace(entry.text));
  const spokenText = spoken.map((entry) => entry.text).join("");
  if (spoken.length !== spokenCount || spokenText !== script.replace(/\s/gu, "")) {
    throw new Error("The timestamp characters do not match the script");
  }

  return sentences.map((sentence) => {
    let first = -1;
    let last = -1;
    for (let position = sentence.start; position < sentence.end; position++) {
      const index = spokenIndexAtOffset.get(position);
      if (index === undefined) continue;
      if (first === -1) first = index;
      last = index;
    }
    if (first === -1) throw new Error("A sentence has no spoken characters");
    return { start: spoken[first]!.start, end: spoken[last]!.end };
  });
}

/** n + 1 boundaries for n units: 0, each unit's own start (the previous unit absorbs the silence before it), and the MP3's duration. */
export function unitBoundaries(spans: readonly SpeechSpan[], mp3DurationSeconds: number): number[] {
  if (!Number.isFinite(mp3DurationSeconds) || mp3DurationSeconds <= 0) {
    throw new RangeError(`The MP3 duration must be positive and finite, got ${mp3DurationSeconds}`);
  }
  if (spans.length === 0) return [];
  const boundaries = [0];
  for (let index = 1; index < spans.length; index++) {
    boundaries.push(spans[index]!.start);
  }
  boundaries.push(mp3DurationSeconds);
  return boundaries;
}

/** The narrated duration of each unit; they add up to the MP3's duration. */
export function chunkDurations(spans: readonly SpeechSpan[], mp3DurationSeconds: number): number[] {
  const boundaries = unitBoundaries(spans, mp3DurationSeconds);
  const durations: number[] = [];
  for (let index = 0; index + 1 < boundaries.length; index++) {
    const duration = boundaries[index + 1]! - boundaries[index]!;
    if (!(duration > 0)) {
      throw new RangeError(`Unit ${index} has a duration that is not positive (${duration} s)`);
    }
    durations.push(duration);
  }
  return durations;
}
