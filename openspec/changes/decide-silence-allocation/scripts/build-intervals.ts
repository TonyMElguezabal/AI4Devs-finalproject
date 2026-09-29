// decide-silence-allocation (JOS-142) task 4.3 — builds the two intervals.json
// files for the base comparison. Design Decision 3.3: keep ONE grouping (rule
// B's real DP grouping) and compute each of ITS scenes' interval under each
// rule's boundary formula, so the render isolates the cut position, not a
// grouping difference (rule A's own DP grouping differs from rule B's on this
// narration, per step 3's data — irrelevant here on purpose).
//
// Usage: node build-intervals.ts <out-dir>

import { readFileSync, writeFileSync } from "node:fs";
import { RULE_A_ABSORB, RULE_B_SPLIT } from "./compare.ts";
import { findSentences } from "../../../../backend/src/sentences.ts";
import { sentenceSpeechSpans } from "../../../../backend/src/sentenceTimings.ts";
import { SURVEY_SCRIPTS } from "./survey-scripts.ts";
import type { TimestampCharacter } from "../../../../backend/src/narrationTimestamps.ts";

const OUT = process.argv[2]!;
const survey = SURVEY_SCRIPTS.find((s) => s.label === "english-exclamation-paragraph")!;
const native = JSON.parse(readFileSync(`${OUT}/${survey.label}.native.json`, "utf8"));
const characters: TimestampCharacter[] = native.alignment.characters.map((text: string, i: number) => ({
  text,
  start: native.alignment.character_start_times_seconds[i],
  end: native.alignment.character_end_times_seconds[i],
}));
const mp3Duration = characters.at(-1)!.end;

const sentences = findSentences(survey.script, "en");
const spans = sentenceSpeechSpans(survey.script, sentences, characters);

// Rule B's real DP grouping for this narration (verified in step 3/pick-boundary): sentence index ranges.
const GROUPING: Array<[number, number]> = [
  [0, 1], // fragment0
  [2, 2], // fragment1
  [3, 4], // fragment2
  [5, 6], // fragment3
];

function buildScenes(boundaries: number[]) {
  return GROUPING.map(([first, last], i) => ({
    sceneId: String(i + 1),
    start: boundaries[first]!,
    end: boundaries[last + 1]!,
    durationSeconds: boundaries[last + 1]! - boundaries[first]!,
  }));
}

const clipIds = ["fragment0", "fragment1", "fragment2", "fragment3"];
const requestedDurations = [11, 8, 14, 13]; // this narration's real admitted durations (step 3)

function withSourceMetadata(scenes: ReturnType<typeof buildScenes>) {
  return scenes.map((scene, i) => ({
    ...scene,
    sourceDurationSeconds: requestedDurations[i], // filled precisely from ffprobe once clips exist; placeholder here
    sourceWidth: 1344,
    sourceHeight: 768,
    sourceFps: 24,
    sourceHasOwnAudio: false,
    speedFactor: Number((requestedDurations[i]! / scene.durationSeconds).toFixed(4)),
  }));
}

for (const [ruleName, rule] of [["A", RULE_A_ABSORB], ["B", RULE_B_SPLIT]] as const) {
  const boundaries = rule(spans, mp3Duration);
  const scenes = withSourceMetadata(buildScenes(boundaries));
  const intervals = { totalDurationSeconds: mp3Duration, scenes };
  writeFileSync(`${OUT}/intervals-rule-${ruleName}.json`, JSON.stringify(intervals, null, 2));
  console.log(`rule ${ruleName}:`, scenes.map((s) => `${s.durationSeconds.toFixed(3)}s`).join(", "));
}
console.log(`\nSaved ${OUT}/intervals-rule-A.json and intervals-rule-B.json (source metadata's duration is the requested admitted value; update from ffprobe once clips exist, before assembling)`);
