// Which sentences must split, and the unit list the grouping search runs over
// (split-sentences-at-clause-boundaries, design Decisions 2 and 3).

import { findClauseBoundaries } from "./clauseBoundaries.ts";
import { SEGMENTATION_LOWER_BOUND_SECONDS, SEGMENTATION_UPPER_BOUND_SECONDS } from "./config/providers.ts";
import { trimSpan, type Sentence } from "./sentences.ts";

export interface MustSplitClassification {
  /** Its own narration alone exceeds the maximum (AC1). */
  free: boolean;
  /** The sentence right before it is short and the two together exceed the maximum (AC2). */
  borrowed: boolean;
}

/** Decision 2 — classifies every sentence from its narrated duration alone, before any boundary is looked up. */
export function classifyMustSplit(durations: readonly number[]): MustSplitClassification[] {
  return durations.map((duration, index) => {
    const free = duration > SEGMENTATION_UPPER_BOUND_SECONDS;
    const previous = index > 0 ? durations[index - 1] : undefined;
    const borrowed =
      previous !== undefined && previous < SEGMENTATION_LOWER_BOUND_SECONDS && previous + duration > SEGMENTATION_UPPER_BOUND_SECONDS;
    return { free, borrowed };
  });
}

/** A unit the grouping search works over: a whole sentence, or one clause piece of a must-split sentence. */
export type Unit = Sentence;

/**
 * Decisions 2 and 3 — the flat, ordered unit list: a "whole" sentence stays
 * one unit, however many commas or conjunctions it has (AC3). A free
 * must-split sentence is cut at every clause boundary. A borrowed-only
 * sentence is cut at its first boundary alone, so its remainder stays one
 * unit unless it is also free. A must-split sentence with no boundary stays
 * whole (AC4); JOS-140's existing `unsplittable-sentence` exception covers it.
 */
export function buildUnits(script: string, sentences: readonly Sentence[], language: string, durations: readonly number[]): Unit[] {
  const classifications = classifyMustSplit(durations);
  const units: Unit[] = [];

  sentences.forEach((sentence, index) => {
    const { free, borrowed } = classifications[index]!;
    if (!free && !borrowed) {
      units.push(sentence);
      return;
    }

    const localBoundaries = findClauseBoundaries(sentence.text, language);
    if (localBoundaries.length === 0) {
      units.push(sentence); // AC4: no boundary, no split.
      return;
    }

    const chosenBoundaries = free ? localBoundaries : [localBoundaries[0]!];
    const absoluteBoundaries = chosenBoundaries.map((offset) => sentence.start + offset);
    const cuts = [sentence.start, ...absoluteBoundaries, sentence.end];
    for (let index2 = 0; index2 + 1 < cuts.length; index2++) {
      const piece = trimSpan(script, cuts[index2]!, cuts[index2 + 1]!);
      if (piece) units.push(piece);
    }
  });

  return units;
}
