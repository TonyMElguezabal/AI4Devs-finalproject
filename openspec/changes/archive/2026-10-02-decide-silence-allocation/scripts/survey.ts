// decide-silence-allocation (JOS-142) task 2.2 — the pause survey. For each
// of the four scripts (survey-scripts.ts): one real ElevenLabs text-to-speech
// call with timestamps (native shape), and one real forced-alignment call on
// the same MP3 (alignment shape). For every inner unit boundary, in both
// shapes, records the pause length (the gap between the two units' speech, as
// unitBoundaries computes it before halving) and what separates them in the
// script. Saves everything to work/ (git-ignored). Does not import or modify
// any product decision — buildUnits/segmentScript are called exactly as they
// exist today (rule B, still interim).
//
// Usage: DB_PATH=<scratch> PROJECTS_ROOT=<scratch> node survey.ts <out-dir>

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { loadCredential } from "../../../../backend/src/config/credentials.ts";
import { VOICE_PROVIDER } from "../../../../backend/src/config/providers.ts";
import { createElevenLabsAlignmentProvider } from "../../../../backend/src/alignmentProvider.ts";
import type { TimestampCharacter } from "../../../../backend/src/narrationTimestamps.ts";
import { findSentences } from "../../../../backend/src/sentences.ts";
import { buildUnits } from "../../../../backend/src/clauseSplitting.ts";
import { sentenceSpeechSpans, unitBoundaries } from "../../../../backend/src/sentenceTimings.ts";
import { SURVEY_SCRIPTS } from "./survey-scripts.ts";

const OUT = process.argv[2]!;

interface PauseRecord {
  boundaryIndex: number;
  pauseSeconds: number;
  /** The trailing punctuation of the unit before the boundary — the actual cause (terminator, or the clause-boundary mark for a split piece). */
  terminator: string;
  /** The whitespace between the two units' text spans; extra blank lines show here (paragraph break). */
  gapWhitespace: string;
  unitBefore: string;
  unitAfter: string;
}

/** The trailing run of non-alphanumeric marks at the end of `text` (the terminator or clause mark that ends this unit). */
function trailingPunctuation(text: string): string {
  const match = /[^\p{L}\p{N}\s]+$/u.exec(text);
  return match ? match[0] : "";
}

/** The pauses between adjacent units, before unitBoundaries halves them — i.e. spans[i+1].start - spans[i].end. */
function measurePauses(script: string, units: { text: string; start: number; end: number }[], characters: TimestampCharacter[]): PauseRecord[] {
  const spans = sentenceSpeechSpans(script, units, characters);
  const pauses: PauseRecord[] = [];
  for (let i = 0; i + 1 < spans.length; i++) {
    const pauseSeconds = spans[i + 1]!.start - spans[i]!.end;
    const gapWhitespace = script.slice(units[i]!.end, units[i + 1]!.start);
    pauses.push({
      boundaryIndex: i,
      pauseSeconds,
      terminator: trailingPunctuation(units[i]!.text),
      gapWhitespace: JSON.stringify(gapWhitespace), // keep \n\n visible
      unitBefore: units[i]!.text.slice(-30),
      unitAfter: units[i + 1]!.text.slice(0, 30),
    });
  }
  return pauses;
}

/** Real segmentation's own unit list: sentence durations first (rule B), then buildUnits, exactly as segmentScript does. */
function realUnits(script: string, language: string, characters: TimestampCharacter[], mp3Duration: number) {
  const sentences = findSentences(script, language);
  const sentenceSpans = sentenceSpeechSpans(script, sentences, characters);
  const sentenceBoundaries = unitBoundaries(sentenceSpans, mp3Duration);
  const sentenceDurations = sentences.map((_, i) => sentenceBoundaries[i + 1]! - sentenceBoundaries[i]!);
  return buildUnits(script, sentences, language, sentenceDurations);
}

const alignmentProvider = createElevenLabsAlignmentProvider();
const results: unknown[] = [];

for (const survey of SURVEY_SCRIPTS) {
  console.log(`\n=== ${survey.label} (${survey.language}, ${survey.script.length} chars, feature: ${survey.feature})`);

  const nativePath = `${OUT}/${survey.label}.native.json`;
  const mp3Path = `${OUT}/${survey.label}.mp3`;
  let raw: any;
  let mp3: Buffer;
  if (existsSync(nativePath) && existsSync(mp3Path)) {
    console.log("  (using cached native call)");
    raw = JSON.parse(readFileSync(nativePath, "utf8"));
    mp3 = readFileSync(mp3Path);
  } else {
    const tts = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_PROVIDER.voiceId}/with-timestamps`, {
      method: "POST",
      headers: { "content-type": "application/json", "xi-api-key": loadCredential("ELEVENLABS_KEY") },
      body: JSON.stringify({ text: survey.script, model_id: VOICE_PROVIDER.model }),
    });
    if (!tts.ok) throw new Error(`text-to-speech failed for ${survey.label}: HTTP ${tts.status}`);
    raw = await tts.json();
    mp3 = Buffer.from(raw.audio_base64, "base64");
    writeFileSync(mp3Path, mp3);
    writeFileSync(nativePath, JSON.stringify(raw));
  }

  const nativeCharacters: TimestampCharacter[] = raw.alignment.characters.map((text: string, i: number) => ({
    text,
    start: raw.alignment.character_start_times_seconds[i],
    end: raw.alignment.character_end_times_seconds[i],
  }));
  const mp3Duration = nativeCharacters.at(-1)!.end;
  console.log(`  native: ${mp3.length} bytes, ${mp3Duration.toFixed(3)} s`);

  const alignmentPath = `${OUT}/${survey.label}.alignment.json`;
  let alignedCharacters: TimestampCharacter[];
  if (existsSync(alignmentPath)) {
    console.log("  (using cached alignment call)");
    alignedCharacters = JSON.parse(readFileSync(alignmentPath, "utf8"));
  } else {
    const alignment = await alignmentProvider.align(mp3, survey.script);
    if (alignment.kind !== "success") throw new Error(`alignment failed for ${survey.label}: ${alignment.kind} ${JSON.stringify(alignment)}`);
    alignedCharacters = alignment.characters;
    writeFileSync(alignmentPath, JSON.stringify(alignedCharacters));
  }
  console.log(`  alignment: ${alignedCharacters.length} characters`);

  const nativeUnits = realUnits(survey.script, survey.language, nativeCharacters, mp3Duration);
  const alignmentUnits = realUnits(survey.script, survey.language, alignedCharacters, mp3Duration);

  const nativePauses = measurePauses(survey.script, nativeUnits, nativeCharacters);
  const alignmentPauses = measurePauses(survey.script, alignmentUnits, alignedCharacters);

  console.log(`  native units: ${nativeUnits.length}, alignment units: ${alignmentUnits.length}`);
  console.log("  native pauses:");
  for (const p of nativePauses) console.log(`    boundary ${p.boundaryIndex}: ${p.pauseSeconds.toFixed(3)} s, terminator ${JSON.stringify(p.terminator)}, gap ${p.gapWhitespace}`);
  console.log("  alignment pauses:");
  for (const p of alignmentPauses) console.log(`    boundary ${p.boundaryIndex}: ${p.pauseSeconds.toFixed(3)} s, terminator ${JSON.stringify(p.terminator)}, gap ${p.gapWhitespace}`);

  results.push({
    label: survey.label,
    language: survey.language,
    feature: survey.feature,
    mp3Duration,
    nativeUnitCount: nativeUnits.length,
    alignmentUnitCount: alignmentUnits.length,
    nativePauses,
    alignmentPauses,
  });
}

writeFileSync(`${OUT}/survey-results.json`, JSON.stringify(results, null, 2));
console.log(`\nSaved ${OUT}/survey-results.json`);
