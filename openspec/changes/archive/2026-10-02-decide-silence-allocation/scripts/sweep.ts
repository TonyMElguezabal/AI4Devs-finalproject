// decide-silence-allocation (JOS-142) task 4.4 — the threshold sweep. Builds
// an isolated two-scene snippet (sentence1 + sentence2 of
// english-exclamation-paragraph, task 4.1's pick) for pause lengths 1, 1.5, 2,
// 3 and 4 s, under each rule. Unlike the base comparison (assemble.sh's normal
// per-clip retiming), each scene here is a straight TRIM of its 15 s source
// clip down to its target length — never retimed — so every sweep render
// plays at exactly 1.0x (design Decision 3.4): the judgement is about the
// silence, not about slow-down/speed-up quality (JOS-182's subject).
//
// Usage: node sweep.ts <out-dir>

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const OUT = process.argv[2]!;

// Task 4.1's pick, exact real timestamps (english-exclamation-paragraph, native):
const SENTENCE1 = { start: 4.83, end: 10.89 }; // "Waves crashed... night." — 6.06 s tight speech
const SENTENCE2 = { start: 12.005, end: 19.028 }; // "Ropes were checked... fall." — 7.023 s tight speech
const S1_DURATION = SENTENCE1.end - SENTENCE1.start;
const S2_DURATION = SENTENCE2.end - SENTENCE2.start;
const NATURAL_GAP = SENTENCE2.start - SENTENCE1.end; // 1.115 s, for reference in the report

const PAUSE_LENGTHS = [1, 1.5, 2, 3, 4];
const NARRATION_MP3 = `${OUT}/english-exclamation-paragraph.mp3`;
const BEFORE_CLIP = `${OUT}/clip-sweep-before.mp4`; // sentence1's 15 s source
const AFTER_CLIP = `${OUT}/clip-sweep-after.mp4`; // sentence2's 15 s source

function run(cmd: string, args: string[]) {
  execFileSync(cmd, args, { stdio: "pipe" });
}

/** Trims a 15 s source clip to exactly `duration` seconds, normalised the same way `assemble.sh` does (`scale`, `fps`) but with no `setpts` retiming (Decision 3.4). */
function trimClip(source: string, duration: number, outPath: string) {
  run("ffmpeg", [
    "-y", "-i", source,
    "-t", duration.toFixed(3),
    "-filter:v", "scale=1920:1080,fps=30",
    "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18",
    outPath,
  ]);
}

/** Builds the swept audio snippet: sentence1's speech, L seconds of digital silence, sentence2's speech. */
function buildSweptAudio(pauseLength: number, outPath: string, work: string) {
  const s1Path = join(work, "s1.m4a");
  const s2Path = join(work, "s2.m4a");
  const silencePath = join(work, "silence.m4a");
  run("ffmpeg", ["-y", "-i", NARRATION_MP3, "-ss", SENTENCE1.start.toFixed(3), "-to", SENTENCE1.end.toFixed(3), "-c:a", "aac", s1Path]);
  run("ffmpeg", ["-y", "-i", NARRATION_MP3, "-ss", SENTENCE2.start.toFixed(3), "-to", SENTENCE2.end.toFixed(3), "-c:a", "aac", s2Path]);
  run("ffmpeg", ["-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-t", pauseLength.toFixed(3), "-c:a", "aac", silencePath]);
  const listPath = join(work, "concat.txt");
  writeFileSync(listPath, `file '${s1Path}'\nfile '${silencePath}'\nfile '${s2Path}'\n`);
  run("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c:a", "aac", outPath]);
}

for (const pauseLength of PAUSE_LENGTHS) {
  const work = mkdtempSync(join(tmpdir(), "jos142-sweep-"));
  try {
    const audioPath = join(work, "audio.m4a");
    buildSweptAudio(pauseLength, audioPath, work);

    for (const ruleName of ["A", "B"] as const) {
      const s1Duration = ruleName === "A" ? S1_DURATION + pauseLength : S1_DURATION + pauseLength / 2;
      const s2Duration = ruleName === "A" ? S2_DURATION : S2_DURATION + pauseLength / 2;

      const beforeTrimmed = join(work, `before-${ruleName}.mp4`);
      const afterTrimmed = join(work, `after-${ruleName}.mp4`);
      trimClip(BEFORE_CLIP, s1Duration, beforeTrimmed);
      trimClip(AFTER_CLIP, s2Duration, afterTrimmed);

      const listPath = join(work, `video-list-${ruleName}.txt`);
      writeFileSync(listPath, `file '${beforeTrimmed}'\nfile '${afterTrimmed}'\n`);
      const silentVideo = join(work, `silent-${ruleName}.mp4`);
      run("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", silentVideo]);

      const outPath = `${OUT}/sweep-${pauseLength}s-rule-${ruleName}.mp4`;
      run("ffmpeg", ["-y", "-i", silentVideo, "-i", audioPath, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-shortest", outPath]);

      const duration = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", outPath]).toString().trim();
      console.log(`pause ${pauseLength}s, rule ${ruleName}: scene1 ${s1Duration.toFixed(3)}s, scene2 ${s2Duration.toFixed(3)}s, rendered ${duration}s -> ${outPath}`);
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

console.log(`\nNatural gap at this boundary (for reference): ${NATURAL_GAP.toFixed(3)}s`);
