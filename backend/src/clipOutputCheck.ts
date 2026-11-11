import { execFile } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { classifyToolStartFailure, FFPROBE } from "./config/ffmpeg.ts";
import { describeToolProblem } from "./mediaToolsCheck.ts";

const execFileAsync = promisify(execFile);

// check-generated-clip (JOS-265), design Decisions 1-2 — a generated clip is measured from its own bytes before it is
// stored, as an image is (imageOutputCheck.ts). The size and duration rules are the product owner's (2026-11-05).

const MIN_WIDTH = 1920;
const MIN_HEIGHT = 1080;
const DURATION_MARGIN_UNDER_SECONDS = 0.5;
const DURATION_MARGIN_OVER_SECONDS = 1;

/** What ffprobe reports about the file; every field is optional because a broken file reports few of them. */
export type ClipMeasure = {
  formatName?: string;
  framesRead?: number;
  width?: number;
  height?: number;
  durationSeconds?: number;
};

export type ClipCheckOutcome = { ok: true } | { ok: false; unavailable: boolean; reason: string };

/** Decision 1 — the rules, in order; the first that fails is the reason shown to the User. */
export function judgeClip(measure: ClipMeasure, requestedSeconds: number): ClipCheckOutcome {
  const refuse = (reason: string): ClipCheckOutcome => ({ ok: false, unavailable: false, reason });
  if (!measure.formatName?.split(",").includes("mp4")) return refuse("the generated clip is not an MP4 file that can be read");
  const { width, height, durationSeconds } = measure;
  if (!measure.framesRead || width === undefined || height === undefined) return refuse("the generated clip has no video that can be decoded");
  if (width < MIN_WIDTH || height < MIN_HEIGHT || width <= height) {
    return refuse(`the generated clip is ${width}x${height}; a clip must be horizontal and at least ${MIN_WIDTH}x${MIN_HEIGHT}`);
  }
  if (
    durationSeconds === undefined ||
    durationSeconds < requestedSeconds - DURATION_MARGIN_UNDER_SECONDS ||
    durationSeconds > requestedSeconds + DURATION_MARGIN_OVER_SECONDS
  ) {
    const measured = durationSeconds === undefined ? "no measurable length" : `${durationSeconds.toFixed(1)} s`;
    return refuse(`the generated clip lasts ${measured}, but ${requestedSeconds} s was requested`);
  }
  return { ok: true };
}

/**
 * Decision 2 — one ffprobe call on a temporary copy. `-read_intervals %+#1 -count_frames` decodes only the first frame,
 * which proves the video decodes without decoding all of it. A file, not a pipe: an MP4 whose index is at the end needs
 * a seekable input. A tool that cannot start says nothing about the clip, so it is `unavailable`, not a refusal.
 */
export async function checkClip(bytes: Uint8Array, requestedSeconds: number, ffprobePath: string = FFPROBE): Promise<ClipCheckOutcome> {
  const folder = mkdtempSync(join(tmpdir(), "vid4you-clip-check-"));
  try {
    const file = join(folder, "clip");
    writeFileSync(file, bytes);
    let stdout: string;
    try {
      ({ stdout } = await execFileAsync(ffprobePath, [
        "-v", "error", "-select_streams", "v:0", "-read_intervals", "%+#1", "-count_frames",
        "-show_entries", "stream=codec_type,width,height,nb_read_frames:format=format_name,duration",
        "-of", "json", file,
      ]));
    } catch (error) {
      const problem = classifyToolStartFailure(error);
      if (problem === "missing" || problem === "blocked") {
        return { ok: false, unavailable: true, reason: `${describeToolProblem(problem, "ffprobe")} The clip could not be checked.` };
      }
      return { ok: false, unavailable: false, reason: "the generated clip is not an MP4 file that can be read" };
    }
    return judgeClip(parseProbe(stdout), requestedSeconds);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

function parseProbe(stdout: string): ClipMeasure {
  const parsed = JSON.parse(stdout) as { streams?: { width?: number; height?: number; nb_read_frames?: string }[]; format?: { format_name?: string; duration?: string } };
  const stream = parsed.streams?.[0];
  const duration = Number(parsed.format?.duration);
  return {
    formatName: parsed.format?.format_name,
    framesRead: Number(stream?.nb_read_frames) || 0,
    width: stream?.width,
    height: stream?.height,
    durationSeconds: Number.isFinite(duration) ? duration : undefined,
  };
}
