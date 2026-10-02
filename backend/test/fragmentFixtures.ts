import type { FragmentException, SegmentedFragment } from "../src/sceneRegistration.ts";

export interface FragmentSpec {
  text: string;
  seconds: number;
  exception?: FragmentException;
}

/** Fragments whose narration intervals are contiguous from 0, each `seconds` long. */
export function contiguousFragments(specs: readonly FragmentSpec[]): SegmentedFragment[] {
  let start = 0;
  return specs.map((spec) => {
    const fragment: SegmentedFragment = {
      text: spec.text,
      narrationInterval: { startSeconds: start, endSeconds: start + spec.seconds },
      ...(spec.exception ? { exception: spec.exception } : {}),
    };
    start += spec.seconds;
    return fragment;
  });
}

/** The voice-over duration these fragments partition: the last interval's end. */
export function voiceOverDurationOf(fragments: readonly SegmentedFragment[]): number {
  return fragments.at(-1)?.narrationInterval.endSeconds ?? 0;
}
