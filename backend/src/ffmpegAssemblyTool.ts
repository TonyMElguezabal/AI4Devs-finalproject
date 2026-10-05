// assemble-final-video (JOS-149) — real ffmpeg adapter for AssemblyTool.
// Implements the pipeline documented in ADR 0005 (define-media-assembly, JOS-182):
//   1. Per-clip: setpts retime (video only), scale+fps normalise, exact frame count.
//   2. Concat all normalised clips in the caller-supplied order.
//   3. Mux voice-over with -c:a copy (never re-encode — ADR 0005, Decision 4b).

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import type { AssemblyInput, AssemblyResult, AssemblyTool } from "./assemblyTool.ts";

const FFMPEG = "/opt/homebrew/bin/ffmpeg";
const FFPROBE = "/opt/homebrew/bin/ffprobe";

function probeVideoDuration(path: string): number {
  const out = execFileSync(FFPROBE, [
    "-v", "error",
    "-show_entries", "format=duration",
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
        const { clips, voiceOverPath, outputPath, fps, width, height } = input;
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

        // Stage 2 — concat all normalised clips + mux voice-over.
        const filterInputs: string[] = [];
        const concatRefs: string[] = [];
        normalised.forEach((f, i) => {
          filterInputs.push("-i", f);
          concatRefs.push(`[${i}:v]`);
        });
        const voiceIndex = normalised.length;
        const filterComplex = `${concatRefs.join("")}concat=n=${normalised.length}:v=1:a=0[outv]`;

        execFileSync(FFMPEG, [
          "-y", "-hide_banner", "-loglevel", "error",
          ...filterInputs,
          "-i", voiceOverPath,
          "-filter_complex", filterComplex,
          "-map", "[outv]",
          "-map", `${voiceIndex}:a`,
          "-c:v", "libx264", "-pix_fmt", "yuv420p",
          "-c:a", "copy",
          outputPath,
        ]);

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
