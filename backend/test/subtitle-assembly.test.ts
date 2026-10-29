import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { AssemblyInput } from "../src/assemblyTool.ts";
import { resolveSubtitleFontPath } from "../src/config/subtitleFont.ts";
import { buildMuxArguments, createFfmpegAssemblyTool } from "../src/ffmpegAssemblyTool.ts";
import type { SubtitleCue } from "../src/subtitles.ts";

// add-burned-in-subtitles (JOS-237), group 4 — design Decisions 3, 4 and 5.

const MONO_44K = { sampleRate: 44100, channelLayout: "mono" };
const base = { videoInputPaths: ["/w/a.mp4", "/w/b.mp4"], voiceOverPath: "/p/voice-over.mp3", outputPath: "/w/out.mp4" };

const SECRET = "TOPSECRETSCRIPTTEXT";
const cues: SubtitleCue[] = [{ startSeconds: 0, endSeconds: 2, words: [{ text: SECRET, startSeconds: 0 }] }];

const inputWith = (subtitles: AssemblyInput["subtitles"]): AssemblyInput => ({
  clips: [],
  voiceOverPath: "/p/voice-over.mp3",
  outputPath: "/w/out.mp4",
  fps: 30,
  width: 1920,
  height: 1080,
  ...(subtitles === undefined ? {} : { subtitles }),
});

describe("buildMuxArguments with subtitles (design Decision 4)", () => {
  it("draws the subtitles after the concat, from plain relative paths", () => {
    const args = buildMuxArguments({ ...base, burnSubtitles: true });

    const graph = args[args.indexOf("-filter_complex") + 1]!;
    expect(graph).toBe("[0:v][1:v]concat=n=2:v=1:a=0[cat];[cat]subtitles=subtitles.ass:fontsdir=fonts[outv]");
    expect(args).toContain("[outv]");
    expect(args.slice(args.indexOf("-c:a"), args.indexOf("-c:a") + 2)).toEqual(["-c:a", "copy"]); // the narration is still copied
  });

  it("adds the subtitles to the video graph when the narration is edited too", () => {
    const args = buildMuxArguments({ ...base, burnSubtitles: true, narrationEdits: [{ atSeconds: 10, deltaSeconds: -1.5 }], audio: MONO_44K });

    const graph = args[args.indexOf("-filter_complex") + 1]!;
    expect(graph).toContain("[cat];[cat]subtitles=subtitles.ass:fontsdir=fonts[outv]");
    expect(graph).toContain("[2:a]atrim=");
    expect(args).toContain("[outa]");
  });

  it("is exactly what it was without subtitles when none are asked for", () => {
    expect(buildMuxArguments({ ...base, burnSubtitles: false })).toEqual(buildMuxArguments(base));
    expect(buildMuxArguments(base)[buildMuxArguments(base).indexOf("-filter_complex") + 1]).toBe("[0:v][1:v]concat=n=2:v=1:a=0[outv]");
  });
});

describe("the ffmpeg adapter refuses to deliver a video without its subtitles (design Decisions 3 and 5)", () => {
  const bundledFont = resolveSubtitleFontPath({});

  it("fails as not retryable when the orchestrator could not build the cues", async () => {
    const tool = createFfmpegAssemblyTool({ subtitleFontPath: bundledFont, ffmpegHasSubtitleFilter: () => true });

    const result = await tool.assemble(inputWith(null));

    expect(result).toEqual({ kind: "failed_not_retryable", reason: expect.stringMatching(/subtitles could not be built.*timestamps/i) });
  });

  it("fails as not retryable when ffmpeg has no subtitles filter", async () => {
    const tool = createFfmpegAssemblyTool({ subtitleFontPath: bundledFont, ffmpegHasSubtitleFilter: () => false });

    const result = await tool.assemble(inputWith(cues));

    expect(result).toEqual({ kind: "failed_not_retryable", reason: expect.stringMatching(/subtitle support|libass/i) });
  });

  it("fails as not retryable when the bundled font is missing", async () => {
    const tool = createFfmpegAssemblyTool({ subtitleFontPath: "/no/such/Montserrat-Bold.ttf", ffmpegHasSubtitleFilter: () => true });

    const result = await tool.assemble(inputWith(cues));

    expect(result).toEqual({ kind: "failed_not_retryable", reason: expect.stringMatching(/font/i) });
  });

  it("never puts the script's text in a failure cause", async () => {
    for (const options of [
      { subtitleFontPath: "/no/such/font.ttf", ffmpegHasSubtitleFilter: () => true },
      { subtitleFontPath: bundledFont, ffmpegHasSubtitleFilter: () => false },
    ]) {
      const result = await createFfmpegAssemblyTool(options).assemble(inputWith(cues));
      expect(result.kind).toBe("failed_not_retryable");
      expect(JSON.stringify(result)).not.toContain(SECRET);
    }
  });
});

describe("resolveSubtitleFontPath (design Decision 4)", () => {
  it("prefers SUBTITLE_FONT_PATH, as the packaged app sets it beside the executable", () => {
    expect(resolveSubtitleFontPath({ SUBTITLE_FONT_PATH: "/opt/vid4you/Montserrat-Bold.ttf" })).toBe("/opt/vid4you/Montserrat-Bold.ttf");
  });

  it("otherwise points at the font bundled with the backend, which exists", () => {
    const path = resolveSubtitleFontPath({});
    expect(path.endsWith("assets/fonts/Montserrat-Bold.ttf")).toBe(true);
    expect(existsSync(path)).toBe(true);
  });
});
