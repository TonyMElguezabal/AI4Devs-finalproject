// assemble-final-video (JOS-149) — real ffmpeg adapter for AssemblyTool.
// Implements the pipeline documented in ADR 0005 (define-media-assembly, JOS-182):
//   1. Per-clip: setpts retime (video only), scale+fps normalise, exact frame count.
//   2. Concat all normalised clips in the caller-supplied order.
//   3. Mux voice-over with -c:a copy (never re-encode — ADR 0005, Decision 4b).
//
// adjust-scene-pause (JOS-190), design Decision 5 — the one exception to step 3: when the caller passes narration
// edits, silence is cut out of or inserted into the narration at the pauses' midpoints, the result is encoded ONCE
// (AAC 192 kbps), and the output is measured: audio and video must agree within one frame or the attempt fails.
// With no edits, step 3 is unchanged and Decision 4b's guarantee holds exactly as before.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import type { AssemblyInput, AssemblyResult, AssemblyTool, NarrationEdit } from "./assemblyTool.ts";

const FFMPEG = "/opt/homebrew/bin/ffmpeg";
const FFPROBE = "/opt/homebrew/bin/ffprobe";

/** The narration's own sample rate and channel layout, so inserted silence matches it exactly. */
export interface AudioShape {
  sampleRate: number;
  channelLayout: string;
}

const seconds = (value: number): string => value.toFixed(6);

type NarrationPart = { kind: "range"; start: number; end: number | null } | { kind: "silence"; seconds: number };

/**
 * The audio filtergraph for `edits`, reading the narration from input `audioInputIndex` and ending at `[outa]`. A
 * negative delta removes `|delta|` centred on `atSeconds`; a positive one inserts that much silence at `atSeconds`.
 * Cuts that overlap are refused rather than silently producing a different narration.
 */
export function buildNarrationFilter(edits: readonly NarrationEdit[], audioInputIndex: number, audio: AudioShape): string {
  const ordered = [...edits].filter((edit) => edit.deltaSeconds !== 0).sort((a, b) => a.atSeconds - b.atSeconds);
  const parts: NarrationPart[] = [];
  let cursor = 0;
  for (const edit of ordered) {
    if (edit.deltaSeconds < 0) {
      const half = -edit.deltaSeconds / 2;
      const cutStart = edit.atSeconds - half;
      if (cutStart < cursor - 1e-9) throw new Error("narration edits overlap");
      parts.push({ kind: "range", start: cursor, end: cutStart });
      cursor = edit.atSeconds + half;
    } else {
      if (edit.atSeconds < cursor - 1e-9) throw new Error("narration edits overlap");
      parts.push({ kind: "range", start: cursor, end: edit.atSeconds });
      parts.push({ kind: "silence", seconds: edit.deltaSeconds });
      cursor = edit.atSeconds;
    }
  }
  parts.push({ kind: "range", start: cursor, end: null });

  const kept = parts.filter((part) => part.kind === "silence" || part.end === null || part.end - part.start > 1e-6);
  const nodes = kept.map((part, index) => {
    if (part.kind === "silence") {
      return `anullsrc=r=${audio.sampleRate}:cl=${audio.channelLayout},atrim=duration=${seconds(part.seconds)},asetpts=PTS-STARTPTS[n${index}]`;
    }
    const range = part.end === null ? `start=${seconds(part.start)}` : `start=${seconds(part.start)}:end=${seconds(part.end)}`;
    return `[${audioInputIndex}:a]atrim=${range},asetpts=PTS-STARTPTS[n${index}]`;
  });
  const labels = kept.map((_, index) => `[n${index}]`).join("");
  return `${nodes.join(";")};${labels}concat=n=${kept.length}:v=0:a=1[outa]`;
}

/** The final mux: the normalised clips concatenated, plus the narration — copied as-is, or edited and encoded once. */
export function buildMuxArguments(input: {
  videoInputPaths: readonly string[];
  voiceOverPath: string;
  outputPath: string;
  narrationEdits?: readonly NarrationEdit[];
  audio?: AudioShape;
}): string[] {
  const { videoInputPaths, voiceOverPath, outputPath, narrationEdits, audio } = input;
  const voiceIndex = videoInputPaths.length;
  const videoGraph = `${videoInputPaths.map((_, index) => `[${index}:v]`).join("")}concat=n=${videoInputPaths.length}:v=1:a=0[outv]`;
  const inputs = [...videoInputPaths.flatMap((path) => ["-i", path]), "-i", voiceOverPath];
  const edited = narrationEdits !== undefined && narrationEdits.some((edit) => edit.deltaSeconds !== 0);

  if (!edited) {
    return [
      "-y", "-hide_banner", "-loglevel", "error",
      ...inputs,
      "-filter_complex", videoGraph,
      "-map", "[outv]",
      "-map", `${voiceIndex}:a`,
      "-c:v", "libx264", "-pix_fmt", "yuv420p",
      "-c:a", "copy",
      outputPath,
    ];
  }
  if (!audio) throw new Error("the narration's audio shape (sample rate and channels) is needed to edit it");
  return [
    "-y", "-hide_banner", "-loglevel", "error",
    ...inputs,
    "-filter_complex", `${videoGraph};${buildNarrationFilter(narrationEdits, voiceIndex, audio)}`,
    "-map", "[outv]",
    "-map", "[outa]",
    "-c:v", "libx264", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "192k",
    outputPath,
  ];
}

function probeVideoDuration(path: string): number {
  const out = execFileSync(FFPROBE, [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "csv=p=0",
    path,
  ], { encoding: "utf8" }).trim();
  return parseFloat(out);
}

function probeAudioShape(path: string): AudioShape {
  const out = execFileSync(FFPROBE, [
    "-v", "error", "-select_streams", "a:0",
    "-show_entries", "stream=sample_rate,channels",
    "-of", "csv=p=0",
    path,
  ], { encoding: "utf8" }).trim();
  const [rate, channels] = out.split(",");
  const sampleRate = Number(rate);
  const layout = channels === "1" ? "mono" : channels === "2" ? "stereo" : null;
  if (!Number.isFinite(sampleRate) || sampleRate <= 0 || layout === null) {
    throw new Error(`the narration's audio could not be read (sample rate ${rate}, channels ${channels})`);
  }
  return { sampleRate, channelLayout: layout };
}

function probeAudioStreamDuration(path: string): number {
  const out = execFileSync(FFPROBE, [
    "-v", "error", "-select_streams", "a:0",
    "-show_entries", "stream=duration",
    "-of", "csv=p=0",
    path,
  ], { encoding: "utf8" }).trim();
  return parseFloat(out);
}

export function createFfmpegAssemblyTool(): AssemblyTool {
  return {
    async assemble(input: AssemblyInput): Promise<AssemblyResult> {
      const work = mkdtempSync(join(tmpdir(), "vid4you-assembly-"));
      try {
        const { clips, voiceOverPath, outputPath, fps, width, height, narrationEdits } = input;
        const normalised: string[] = [];

        // Stage 1 — retime + normalise each clip (ADR 0005, Decisions 1-4).
        for (let i = 0; i < clips.length; i++) {
          const clip = clips[i]!;
          const srcDur = probeVideoDuration(clip.clipPath);
          const renderDur = clip.frameCount / fps;
          const setptsMultiplier = renderDur / srcDur;
          const outPath = join(work, `scene-${i}-normalized.mp4`);

          execFileSync(FFMPEG, [
            "-y", "-hide_banner", "-loglevel", "error",
            "-i", clip.clipPath,
            "-map", "0:v:0",
            "-filter:v", `setpts=${setptsMultiplier}*PTS,scale=${width}:${height},fps=${fps}`,
            "-frames:v", String(clip.frameCount),
            "-c:v", "libx264", "-pix_fmt", "yuv420p",
            outPath,
          ]);

          normalised.push(outPath);
        }

        // Stage 2 — concat all normalised clips + the narration (copied, or edited and encoded once).
        const edited = narrationEdits !== undefined && narrationEdits.some((edit) => edit.deltaSeconds !== 0);
        execFileSync(
          FFMPEG,
          buildMuxArguments({
            videoInputPaths: normalised,
            voiceOverPath,
            outputPath,
            ...(edited ? { narrationEdits, audio: probeAudioShape(voiceOverPath) } : {}),
          }),
        );

        // Stage 3 — only for an edited narration: measure, never assume (ADR 0005's methodological note).
        if (edited) {
          const videoSeconds = clips.reduce((sum, clip) => sum + clip.frameCount, 0) / fps;
          const audioSeconds = probeAudioStreamDuration(outputPath);
          if (!Number.isFinite(audioSeconds) || Math.abs(audioSeconds - videoSeconds) > 1 / fps) {
            return {
              kind: "failed_transient",
              reason: `the edited narration and the video do not agree: audio ${audioSeconds.toFixed(3)} s, video ${videoSeconds.toFixed(3)} s (more than one frame apart)`,
            };
          }
        }

        return { kind: "success", outputPath };
      } catch (err: unknown) {
        const reason = err instanceof Error ? err.message : String(err);
        // execFileSync throws for non-zero exit; treat all ffmpeg failures as
        // transient by default — a missing file is not-retryable, but
        // distinguishing those here is fragile. The retry policy handles budget.
        return { kind: "failed_transient", reason };
      } finally {
        rmSync(work, { recursive: true, force: true });
      }
    },
  };
}
