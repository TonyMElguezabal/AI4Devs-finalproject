// decide-silence-allocation (JOS-142) task 3.1 — numeric comparison of the
// two D11 candidate rules (design Decision 1) over the real segmentation
// pipeline. `segmentScript` itself hardcodes `unitBoundaries` (rule B), so
// this reimplements its exact DP (copied from backend/src/segmentation.ts,
// unchanged) with the boundary rule as a parameter, calling the real
// `findSentences`, `buildUnits`, `sentenceSpeechSpans` and
// `closestAdmittedDuration` — no product code is edited. Task 3.2's harness
// check verifies this reproduction is faithful before task 3.3 trusts it.

import { readFileSync, writeFileSync } from "node:fs";
import { closestAdmittedDuration } from "../../../../backend/src/admittedDurations.ts";
import { SEGMENTATION_LOWER_BOUND_SECONDS, SEGMENTATION_UPPER_BOUND_SECONDS } from "../../../../backend/src/config/providers.ts";
import { buildUnits } from "../../../../backend/src/clauseSplitting.ts";
import type { TimestampCharacter } from "../../../../backend/src/narrationTimestamps.ts";
import { segmentScript, type SegmentationResult } from "../../../../backend/src/segmentation.ts";
import { findSentences } from "../../../../backend/src/sentences.ts";
import { sentenceSpeechSpans, type SpeechSpan } from "../../../../backend/src/sentenceTimings.ts";
import { SURVEY_SCRIPTS } from "./survey-scripts.ts";

const OUT = process.argv[2]!;

// ---- Decision 1's two candidate boundary rules -----------------------------

export type BoundaryRule = (spans: readonly SpeechSpan[], mp3DurationSeconds: number) => number[];

/** Rule B — the silence is split between the adjacent units (today's `unitBoundaries`, copied verbatim so this file has no import-order dependency on it besides the harness check). */
export const RULE_B_SPLIT: BoundaryRule = (spans, mp3DurationSeconds) => {
  if (!Number.isFinite(mp3DurationSeconds) || mp3DurationSeconds <= 0) {
    throw new RangeError(`The MP3 duration must be positive and finite, got ${mp3DurationSeconds}`);
  }
  if (spans.length === 0) return [];
  const boundaries = [0];
  for (let index = 1; index < spans.length; index++) boundaries.push((spans[index - 1]!.end + spans[index]!.start) / 2);
  boundaries.push(mp3DurationSeconds);
  return boundaries;
};

/** Rule A — the previous unit absorbs the silence that follows it: the boundary is the next unit's speech start. */
export const RULE_A_ABSORB: BoundaryRule = (spans, mp3DurationSeconds) => {
  if (!Number.isFinite(mp3DurationSeconds) || mp3DurationSeconds <= 0) {
    throw new RangeError(`The MP3 duration must be positive and finite, got ${mp3DurationSeconds}`);
  }
  if (spans.length === 0) return [];
  const boundaries = [0];
  for (let index = 1; index < spans.length; index++) boundaries.push(spans[index]!.start);
  boundaries.push(mp3DurationSeconds);
  return boundaries;
};

export const RULES: Record<"A" | "B", BoundaryRule> = { A: RULE_A_ABSORB, B: RULE_B_SPLIT };

// ---- The DP, copied from segmentScript, parameterized by the boundary rule -

export interface DiagnosedFragment {
  text: string;
  narratedDurationSeconds: number;
  exception?: "script-below-lower-bound" | "unsplittable-sentence";
  admittedDuration: number;
  speedRatio: number;
  withinBounds: boolean;
}

export type ComparisonResult = { ok: true; fragments: DiagnosedFragment[] } | { ok: false; reason: string };

interface Grouping {
  shortEndCount: number;
  totalSpeedChange: number;
  fragmentCount: number;
  firstFragmentLast: number;
  next: Grouping | null;
  exceptions: Array<DiagnosedFragment["exception"]>;
}

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

/** segmentScript's exact algorithm, with the boundary rule injected instead of hardcoded. */
export function segmentWithRule(
  script: string,
  language: string,
  characters: readonly TimestampCharacter[],
  mp3DurationSeconds: number,
  boundaryRule: BoundaryRule,
): ComparisonResult {
  const sentences = findSentences(script, language);
  if (sentences.length === 0) return { ok: false, reason: "the script has no sentences" };

  let sentenceBoundaries: number[];
  try {
    sentenceBoundaries = boundaryRule(sentenceSpeechSpans(script, sentences, characters), mp3DurationSeconds);
  } catch (error) {
    return { ok: false, reason: `the narration timestamps do not match the script (${(error as Error).message})` };
  }

  const sentenceDurations = sentences.map((_, index) => sentenceBoundaries[index + 1]! - sentenceBoundaries[index]!);
  const units = buildUnits(script, sentences, language, sentenceDurations);
  const boundaries = boundaryRule(sentenceSpeechSpans(script, units, characters), mp3DurationSeconds);

  const count = units.length;
  const durationOf = (first: number, last: number): number => boundaries[last + 1]! - boundaries[first]!;
  const isShort = (index: number): boolean => durationOf(index, index) < SEGMENTATION_LOWER_BOUND_SECONDS;

  function classify(first: number, last: number): { allowed: boolean; exception?: DiagnosedFragment["exception"] } {
    const duration = durationOf(first, last);
    if (duration >= SEGMENTATION_LOWER_BOUND_SECONDS && duration <= SEGMENTATION_UPPER_BOUND_SECONDS) return { allowed: true };
    if (duration < SEGMENTATION_LOWER_BOUND_SECONDS) {
      const wholeScript = first === 0 && last === count - 1;
      return wholeScript ? { allowed: true, exception: "script-below-lower-bound" } : { allowed: false };
    }
    const cannotSplit = first === last || (last === first + 1 && isShort(first));
    return cannotSplit ? { allowed: true, exception: "unsplittable-sentence" } : { allowed: false };
  }

  const best: Array<Grouping | null> = new Array(count + 1).fill(null);
  best[count] = { shortEndCount: 0, totalSpeedChange: 0, fragmentCount: 0, firstFragmentLast: count - 1, next: null, exceptions: [] };

  for (let first = count - 1; first >= 0; first--) {
    for (let last = first; last < count; last++) {
      if (durationOf(first, last) > SEGMENTATION_UPPER_BOUND_SECONDS && last > first + 1) break;
      const rest = best[last + 1] ?? null;
      if (rest === null) continue;
      const { allowed, exception } = classify(first, last);
      if (!allowed) continue;

      const endsOnShortSentence = isShort(last) && last !== count - 1;
      const candidate: Grouping = {
        shortEndCount: rest.shortEndCount + (endsOnShortSentence ? 1 : 0),
        totalSpeedChange: Math.log(closestAdmittedDuration(durationOf(first, last)).speedRatio) + rest.totalSpeedChange,
        fragmentCount: rest.fragmentCount + 1,
        firstFragmentLast: last,
        next: rest,
        exceptions: [exception, ...rest.exceptions],
      };
      if (isBetter(candidate, best[first] ?? null)) best[first] = candidate;
    }
  }

  const chosen = best[0] ?? null;
  if (chosen === null) return { ok: false, reason: "no grouping of the script's units satisfies the duration bounds" };

  const fragments: DiagnosedFragment[] = [];
  let first = 0;
  let grouping: Grouping | null = chosen;
  for (const exception of chosen.exceptions) {
    const last: number = grouping!.firstFragmentLast;
    const duration = durationOf(first, last);
    const { admitted, speedRatio } = closestAdmittedDuration(duration);
    fragments.push({
      text: script.slice(units[first]!.start, units[last]!.end),
      narratedDurationSeconds: duration,
      ...(exception ? { exception } : {}),
      admittedDuration: admitted,
      speedRatio,
      withinBounds: duration >= SEGMENTATION_LOWER_BOUND_SECONDS && duration <= SEGMENTATION_UPPER_BOUND_SECONDS,
    });
    first = last + 1;
    grouping = grouping!.next;
  }
  return { ok: true, fragments };
}

// ---- Task 3.2 — harness check: rule B here must reproduce segmentScript ----

export function verifyHarness(
  script: string,
  language: string,
  characters: readonly TimestampCharacter[],
  mp3DurationSeconds: number,
): { ok: true } | { ok: false; reason: string } {
  const real: SegmentationResult = segmentScript(script, language, characters, mp3DurationSeconds);
  const reimplemented = segmentWithRule(script, language, characters, mp3DurationSeconds, RULE_B_SPLIT);
  if (real.ok !== reimplemented.ok) return { ok: false, reason: `ok mismatch: real=${real.ok} reimplemented=${reimplemented.ok}` };
  if (!real.ok || !reimplemented.ok) return real.ok === reimplemented.ok ? { ok: true } : { ok: false, reason: "mismatch" };
  if (real.fragments.length !== reimplemented.fragments.length) {
    return { ok: false, reason: `fragment count mismatch: real=${real.fragments.length} reimplemented=${reimplemented.fragments.length}` };
  }
  for (let i = 0; i < real.fragments.length; i++) {
    const a = real.fragments[i]!;
    const b = reimplemented.fragments[i]!;
    if (a.text !== b.text) return { ok: false, reason: `fragment ${i} text mismatch` };
    if (Math.abs(a.narratedDurationSeconds - b.narratedDurationSeconds) > 1e-9) {
      return { ok: false, reason: `fragment ${i} duration mismatch: real=${a.narratedDurationSeconds} reimplemented=${b.narratedDurationSeconds}` };
    }
    if ((a.exception ?? null) !== (b.exception ?? null)) return { ok: false, reason: `fragment ${i} exception mismatch` };
  }
  return { ok: true };
}

// ---- Main: run both rules on all 8 survey narrations -----------------------

interface NarrationInput {
  label: string;
  language: string;
  shape: "native" | "alignment";
  script: string;
  characters: TimestampCharacter[];
  mp3Duration: number;
}

function loadNarrations(): NarrationInput[] {
  const inputs: NarrationInput[] = [];
  for (const survey of SURVEY_SCRIPTS) {
    const native = JSON.parse(readFileSync(`${OUT}/${survey.label}.native.json`, "utf8"));
    const nativeCharacters: TimestampCharacter[] = native.alignment.characters.map((text: string, i: number) => ({
      text,
      start: native.alignment.character_start_times_seconds[i],
      end: native.alignment.character_end_times_seconds[i],
    }));
    const mp3Duration = nativeCharacters.at(-1)!.end;
    inputs.push({ label: survey.label, language: survey.language, shape: "native", script: survey.script, characters: nativeCharacters, mp3Duration });

    const alignedCharacters: TimestampCharacter[] = JSON.parse(readFileSync(`${OUT}/${survey.label}.alignment.json`, "utf8"));
    inputs.push({ label: survey.label, language: survey.language, shape: "alignment", script: survey.script, characters: alignedCharacters, mp3Duration });
  }
  return inputs;
}

// JOS-182's recommendation (its ADR, Decision 5): 0.5x (slow-down floor) to 2.0x (speed-up ceiling) on the
// signed factor `admitted / narrated`. Since 0.5 and 2.0 are exact reciprocals, checking the signed factor
// against that asymmetric range is equivalent to checking closestAdmittedDuration's unsigned speedRatio
// (= max(factor, 1/factor), always >= 1) against 2.0 alone, in either direction. Not a hardcoded product
// constant — US-33 fixes it; this only checks against JOS-182's recommendation.
const SPEED_RATIO_LIMIT = 2.0;

const narrations = loadNarrations();
const harnessFailures: string[] = [];
for (const n of narrations) {
  const check = verifyHarness(n.script, n.language, n.characters, n.mp3Duration);
  if (!check.ok) harnessFailures.push(`${n.label} (${n.shape}): ${check.reason}`);
}
console.log(`Harness check (task 3.2): ${harnessFailures.length === 0 ? "PASS — reimplementation matches segmentScript exactly on all 8 narrations" : "FAIL"}`);
for (const f of harnessFailures) console.log(`  ${f}`);
if (harnessFailures.length > 0) {
  writeFileSync(`${OUT}/compare-results.json`, JSON.stringify({ harnessFailures }, null, 2));
  process.exit(1);
}

const report: unknown[] = [];
for (const n of narrations) {
  const perRule: Record<string, unknown> = {};
  for (const [ruleName, rule] of Object.entries(RULES)) {
    const result = segmentWithRule(n.script, n.language, n.characters, n.mp3Duration, rule);
    if (!result.ok) {
      perRule[ruleName] = { ok: false, reason: result.reason };
      continue;
    }
    const outsideBounds = result.fragments.filter((f) => !f.withinBounds && !f.exception);
    const flagged = result.fragments.filter((f) => f.exception);
    const speedRatiosOutsideLimit = result.fragments.filter((f) => !f.exception).filter((f) => f.speedRatio > SPEED_RATIO_LIMIT);
    perRule[ruleName] = {
      ok: true,
      fragmentCount: result.fragments.length,
      fragments: result.fragments.map((f) => ({
        text: f.text.slice(0, 40) + (f.text.length > 40 ? "…" : ""),
        durationSeconds: Number(f.narratedDurationSeconds.toFixed(3)),
        admittedDuration: f.admittedDuration,
        speedRatio: Number(f.speedRatio.toFixed(4)),
        exception: f.exception ?? null,
      })),
      totalDuration: Number(result.fragments.reduce((sum, f) => sum + f.narratedDurationSeconds, 0).toFixed(3)),
      maxSpeedRatioUnflagged: Number(Math.max(...result.fragments.filter((f) => !f.exception).map((f) => f.speedRatio), 1).toFixed(4)),
      outsideBoundsUnflagged: outsideBounds.length,
      flaggedCount: flagged.length,
      speedRatiosOutsideLimit: speedRatiosOutsideLimit.length,
    };
  }
  const a = perRule.A as any;
  const b = perRule.B as any;
  const groupingsDiffer = a.ok && b.ok ? JSON.stringify(a.fragments.map((f: any) => f.text)) !== JSON.stringify(b.fragments.map((f: any) => f.text)) : null;

  console.log(`\n=== ${n.label} (${n.shape}, mp3 ${n.mp3Duration.toFixed(3)} s) ===`);
  console.log(`  rule A: ${a.ok ? `${a.fragmentCount} fragments, total ${a.totalDuration}s, max speed ratio ${a.maxSpeedRatioUnflagged}x, flagged ${a.flaggedCount}` : `NO VALID GROUPING (${a.reason})`}`);
  console.log(`  rule B: ${b.ok ? `${b.fragmentCount} fragments, total ${b.totalDuration}s, max speed ratio ${b.maxSpeedRatioUnflagged}x, flagged ${b.flaggedCount}` : `NO VALID GROUPING (${b.reason})`}`);
  if (groupingsDiffer !== null) console.log(`  groupings differ: ${groupingsDiffer}`);

  report.push({ label: n.label, shape: n.shape, mp3Duration: n.mp3Duration, ruleA: perRule.A, ruleB: perRule.B, groupingsDiffer });
}

writeFileSync(`${OUT}/compare-results.json`, JSON.stringify(report, null, 2));
console.log(`\nSaved ${OUT}/compare-results.json`);
