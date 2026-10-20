import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AssemblyInput } from "../src/assemblyTool.ts";
import { FFMPEG, FFPROBE } from "../src/config/ffmpeg.ts";
import { buildMuxArguments, buildNarrationFilter, createFfmpegAssemblyTool } from "../src/ffmpegAssemblyTool.ts";
import { createCapturingAssemblyTool } from "../src/stubAssemblyTool.ts";

// adjust-scene-pause (JOS-190), group 5 — design Decision 5. With no edits the narration is copied as-is (ADR 0005
// Decision 4b); with edits, silence is removed or inserted at the pause midpoints and the result is encoded once and
// MEASURED: audio and video must agree within one frame or the attempt fails.

const MONO_44K = { sampleRate: 44100, channelLayout: "mono" };

describe("buildNarrationFilter", () => {
  it("cuts silence out of a trimmed pause, around its midpoint", () => {
    const filter = buildNarrationFilter([{ atSeconds: 10, deltaSeconds: -1.5 }], 3, MONO_44K);

    expect(filter).toContain("[3:a]atrim=start=0.000000:end=9.250000,asetpts=PTS-STARTPTS[n0]");
    expect(filter).toContain("[3:a]atrim=start=10.750000,asetpts=PTS-STARTPTS[n1]");
    expect(filter).toContain("[n0][n1]concat=n=2:v=0:a=1[outa]");
  });

  it("inserts silence of the stream's own rate and layout for an extension", () => {
    const filter = buildNarrationFilter([{ atSeconds: 4, deltaSeconds: 1 }], 0, { sampleRate: 48000, channelLayout: "stereo" });

    expect(filter).toContain("[0:a]atrim=start=0.000000:end=4.000000,asetpts=PTS-STARTPTS[n0]");
    expect(filter).toContain("anullsrc=r=48000:cl=stereo,atrim=duration=1.000000,asetpts=PTS-STARTPTS[n1]");
    expect(filter).toContain("[0:a]atrim=start=4.000000,asetpts=PTS-STARTPTS[n2]");
    expect(filter).toContain("[n0][n1][n2]concat=n=3:v=0:a=1[outa]");
  });

  it("handles several edits in time order, whatever order they are given in", () => {
    const filter = buildNarrationFilter(
      [
        { atSeconds: 15, deltaSeconds: -0.6 },
        { atSeconds: 5, deltaSeconds: -1.5 },
      ],
      0,
      MONO_44K,
    );

    expect(filter.indexOf("end=4.250000")).toBeLessThan(filter.indexOf("start=5.750000"));
    expect(filter).toContain("concat=n=3:v=0:a=1[outa]");
  });

  it("refuses edits whose cuts overlap, instead of producing a wrong narration", () => {
    expect(() =>
      buildNarrationFilter(
        [
          { atSeconds: 5, deltaSeconds: -2 },
          { atSeconds: 5.5, deltaSeconds: -2 },
        ],
        0,
        MONO_44K,
      ),
    ).toThrow(/overlap/i);
  });
});

describe("buildMuxArguments", () => {
  const base = { videoInputPaths: ["/w/a.mp4", "/w/b.mp4"], voiceOverPath: "/p/voice-over.mp3", outputPath: "/w/out.mp4" };

  it("with no edits issues the stream-copy mux exactly as before", () => {
    const args = buildMuxArguments(base);

    expect(args).toEqual([
      "-y", "-hide_banner", "-loglevel", "error",
      "-i", "/w/a.mp4", "-i", "/w/b.mp4",
      "-i", "/p/voice-over.mp3",
      "-filter_complex", "[0:v][1:v]concat=n=2:v=1:a=0[outv]",
      "-map", "[outv]",
      "-map", "2:a",
      "-c:v", "libx264", "-pix_fmt", "yuv420p",
      "-c:a", "copy",
      "/w/out.mp4",
    ]);
  });

  it("treats an empty edit list as no edits", () => {
    expect(buildMuxArguments({ ...base, narrationEdits: [], audio: MONO_44K })).toEqual(buildMuxArguments(base));
  });

  it("with edits builds the narration graph and encodes once, never copying", () => {
    const args = buildMuxArguments({ ...base, narrationEdits: [{ atSeconds: 10, deltaSeconds: -1.5 }], audio: MONO_44K });

    const graph = args[args.indexOf("-filter_complex") + 1]!;
    expect(graph).toContain("[0:v][1:v]concat=n=2:v=1:a=0[outv]");
    expect(graph).toContain("[2:a]atrim=");
    expect(args).toContain("[outa]");
    expect(args.slice(args.indexOf("-c:a"), args.indexOf("-c:a") + 4)).toEqual(["-c:a", "aac", "-b:a", "192k"]);
    expect(args).not.toContain("copy");
  });

  it("needs the narration's audio shape when there are edits", () => {
    expect(() => buildMuxArguments({ ...base, narrationEdits: [{ atSeconds: 10, deltaSeconds: -1 }] })).toThrow(/audio/i);
  });
});

describe("the capturing stub", () => {
  it("records the narration edits the phase passes to the tool", async () => {
    const captures: AssemblyInput[] = [];
    const tool = createCapturingAssemblyTool(captures);
    const edits = [{ atSeconds: 10, deltaSeconds: -1.5 }];

    await tool.assemble({ clips: [], voiceOverPath: "v.mp3", outputPath: "o.mp4", fps: 30, width: 1920, height: 1080, narrationEdits: edits });

    expect(captures[0]!.narrationEdits).toEqual(edits);
  });
});

// The fixture committed by define-media-assembly (JOS-182): five scene sources and a 14.4 s voice-over.
const FIXTURE = join(process.cwd(), "..", "openspec", "changes", "archive", "2026-09-26-define-media-assembly", "fixture");
const haveFfmpeg = spawnSync(FFMPEG, ["-version"]).status === 0 && spawnSync(FFPROBE, ["-version"]).status === 0 && existsSync(join(FIXTURE, "voice-over.m4a"));

function probe(path: string, entries: string, stream: string): string {
  return execFileSync(FFPROBE, ["-v", "error", "-select_streams", stream, "-show_entries", entries, "-of", "csv=p=0", path], { encoding: "utf8" }).trim();
}

describe.skipIf(!haveFfmpeg)("the ffmpeg adapter with narration edits (real ffmpeg, committed fixture)", () => {
  const FPS = 30;
  // Five scenes with intervals ending at 2.4, 5.4, 8.4, 11.4, 14.4 s; cumulative frame geometry as the orchestrator builds it.
  const originalEnds = [2.4, 5.4, 8.4, 11.4, 14.4];
  const frameCounts = (ends: number[]): number[] => {
    let previous = 0;
    return ends.map((end) => {
      const cumulative = Math.round(end * FPS);
      const count = cumulative - previous;
      previous = cumulative;
      return count;
    });
  };
  const inputFor = (ends: number[], outputPath: string, narrationEdits?: AssemblyInput["narrationEdits"]): AssemblyInput => {
    const counts = frameCounts(ends);
    let start = 0;
    return {
      clips: ends.map((end, index) => {
        const clip = {
          clipPath: join(FIXTURE, `scene-${index + 1}-source.mp4`),
          narrationStartSeconds: start,
          narrationDurationSeconds: end - start,
          cumulativeStartFrame: Math.round(start * FPS),
          frameCount: counts[index]!,
        };
        start = end;
        return clip;
      }),
      voiceOverPath: join(FIXTURE, "voice-over.m4a"),
      outputPath,
      fps: FPS,
      width: 1920,
      height: 1080,
      ...(narrationEdits ? { narrationEdits } : {}),
    };
  };

  it("keeps the stream copy when there are no edits (audio is the stored AAC, duration unchanged)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "vid4you-narration-edit-test-"));
    try {
      const out = join(dir, "plain.mp4");
      const result = await createFfmpegAssemblyTool().assemble(inputFor(originalEnds, out));

      expect(result.kind).toBe("success");
      expect(probe(out, "stream=codec_name", "a:0")).toBe("aac");
      expect(Number(probe(out, "stream=duration", "a:0"))).toBeCloseTo(14.4, 2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);

  it("removes the cut silence and keeps audio and video within one frame", async () => {
    const dir = mkdtempSync(join(tmpdir(), "vid4you-narration-edit-test-"));
    try {
      const out = join(dir, "edited.mp4");
      // Scene 2's interval loses 0.6 s; every later scene moves 0.6 s earlier. Cut at the middle of the pause at 5.1 s.
      const editedEnds = [2.4, 4.8, 7.8, 10.8, 13.8];
      const result = await createFfmpegAssemblyTool().assemble(inputFor(editedEnds, out, [{ atSeconds: 5.1, deltaSeconds: -0.6 }]));

      expect(result.kind).toBe("success");
      const audio = Number(probe(out, "stream=duration", "a:0"));
      const frames = Number(probe(out, "stream=nb_frames", "v:0"));
      expect(audio).toBeCloseTo(13.8, 2);
      expect(frames).toBe(Math.round(13.8 * FPS));
      expect(Math.abs(frames / FPS - audio)).toBeLessThanOrEqual(1 / FPS);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);

  it("fails the attempt rather than ship audio that no longer matches the video", async () => {
    const dir = mkdtempSync(join(tmpdir(), "vid4you-narration-edit-test-"));
    try {
      const out = join(dir, "mismatch.mp4");
      // The narration is cut by 0.6 s but the clips were NOT shifted: audio 13.8 s against 14.4 s of video.
      const result = await createFfmpegAssemblyTool().assemble(inputFor(originalEnds, out, [{ atSeconds: 5.1, deltaSeconds: -0.6 }]));

      expect(result.kind).toBe("failed_transient");
      expect(result.kind === "failed_transient" && result.reason).toMatch(/audio.*video|video.*audio|sync/i);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);
});
