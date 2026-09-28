import { closestAdmittedDuration } from "./admittedDurations.ts";
import { SEGMENTATION_LOWER_BOUND_SECONDS, SEGMENTATION_UPPER_BOUND_SECONDS } from "./config/providers.ts";
import type { TimestampCharacter } from "./narrationTimestamps.ts";
import type { FragmentException, SegmentedFragment } from "./sceneRegistration.ts";
import { findSentences } from "./sentences.ts";
import { sentenceSpeechSpans, unitBoundaries } from "./sentenceTimings.ts";

// Script segmentation (segment-script-into-chunks, design Decisions 4 and 5):
// group the script's sentences into fragments of whole consecutive sentences
// whose narrated duration fits the video provider's limits, choosing, among
// the valid groupings, the one with the fewest fragments ending on a short
// sentence and then the least total speed change.

export type SegmentationResult = { ok: true; fragments: SegmentedFragment[] } | { ok: false; reason: string };

/** A best grouping of the sentences from some index to the end. */
interface Grouping {
  /** Fragments that end on a sentence under the lower bound, other than the script's last sentence. */
  shortEndCount: number;
  totalSpeedChange: number;
  fragmentCount: number;
  /** The last sentence of the first fragment; the next grouping starts after it. */
  firstFragmentLast: number;
  next: Grouping | null;
  exceptions: Array<FragmentException | undefined>;
}

/** Two totals closer than this are the same total, so ties are decided by the later rules. */
const TOTAL_TOLERANCE = 1e-9;

function isBetter(candidate: Grouping, current: Grouping | null): boolean {
  if (current === null) return true;
  if (candidate.shortEndCount !== current.shortEndCount) return candidate.shortEndCount < current.shortEndCount;
  if (Math.abs(candidate.totalSpeedChange - current.totalSpeedChange) > TOTAL_TOLERANCE) {
    return candidate.totalSpeedChange < current.totalSpeedChange;
  }
  if (candidate.fragmentCount !== current.fragmentCount) return candidate.fragmentCount < current.fragmentCount;
  return candidate.firstFragmentLast > current.firstFragmentLast;
}

export function segmentScript(
  script: string,
  language: string,
  characters: readonly TimestampCharacter[],
  mp3DurationSeconds: number,
): SegmentationResult {
  const sentences = findSentences(script, language);
  if (sentences.length === 0) return { ok: false, reason: "the script has no sentences" };

  let boundaries: number[];
  try {
    boundaries = unitBoundaries(sentenceSpeechSpans(script, sentences, characters), mp3DurationSeconds);
  } catch (error) {
    return { ok: false, reason: `the narration timestamps do not match the script (${(error as Error).message})` };
  }

  const count = sentences.length;
  const durationOf = (first: number, last: number): number => boundaries[last + 1]! - boundaries[first]!;
  const isShort = (index: number): boolean => durationOf(index, index) < SEGMENTATION_LOWER_BOUND_SECONDS;

  /** Decision 4: whether sentences first..last may be one fragment, and the exception it needs, if any. */
  function classify(first: number, last: number): { allowed: boolean; exception?: FragmentException } {
    const duration = durationOf(first, last);
    if (duration >= SEGMENTATION_LOWER_BOUND_SECONDS && duration <= SEGMENTATION_UPPER_BOUND_SECONDS) {
      return { allowed: true };
    }
    if (duration < SEGMENTATION_LOWER_BOUND_SECONDS) {
      const wholeScript = first === 0 && last === count - 1;
      return wholeScript ? { allowed: true, exception: "script-below-lower-bound" } : { allowed: false };
    }
    const cannotSplit = first === last || (last === first + 1 && isShort(first));
    return cannotSplit ? { allowed: true, exception: "unsplittable-sentence" } : { allowed: false };
  }

  // best[i]: the best grouping of sentences i..count-1, or null when none is valid.
  const best: Array<Grouping | null> = new Array(count + 1).fill(null);
  best[count] = { shortEndCount: 0, totalSpeedChange: 0, fragmentCount: 0, firstFragmentLast: count - 1, next: null, exceptions: [] };

  for (let first = count - 1; first >= 0; first--) {
    for (let last = first; last < count; last++) {
      if (durationOf(first, last) > SEGMENTATION_UPPER_BOUND_SECONDS && last > first + 1) break;
      const rest = best[last + 1] ?? null;
      if (rest === null) continue;
      const { allowed, exception } = classify(first, last);
      if (!allowed) continue;

      // PRD §6.1: a short sentence goes with the one that follows; a fragment ending on one is allowed, but counted.
      const endsOnShortSentence = isShort(last) && last !== count - 1;
      const candidate: Grouping = {
        shortEndCount: rest.shortEndCount + (endsOnShortSentence ? 1 : 0),
        totalSpeedChange:
          Math.log(closestAdmittedDuration(durationOf(first, last)).speedRatio) + rest.totalSpeedChange,
        fragmentCount: rest.fragmentCount + 1,
        firstFragmentLast: last,
        next: rest,
        exceptions: [exception, ...rest.exceptions],
      };
      if (isBetter(candidate, best[first] ?? null)) best[first] = candidate;
    }
  }

  const chosen = best[0] ?? null;
  if (chosen === null) return { ok: false, reason: "no grouping of the script's sentences satisfies the duration bounds" };

  const fragments: SegmentedFragment[] = [];
  let first = 0;
  let grouping: Grouping | null = chosen;
  for (const exception of chosen.exceptions) {
    const last: number = grouping!.firstFragmentLast;
    fragments.push({
      text: script.slice(sentences[first]!.start, sentences[last]!.end),
      narratedDurationSeconds: durationOf(first, last),
      ...(exception ? { exception } : {}),
    });
    first = last + 1;
    grouping = grouping!.next;
  }
  return { ok: true, fragments };
}
