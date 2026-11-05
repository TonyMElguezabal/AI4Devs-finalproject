import { execFile, execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AssemblyInput } from "../src/assemblyTool.ts";
import { FFMPEG, FFPROBE } from "../src/config/ffmpeg.ts";
import { createFfmpegAssemblyTool } from "../src/ffmpegAssemblyTool.ts";
import { buildSubtitleCues, type SubtitleCue } from "../src/subtitles.ts";

// add-burned-in-subtitles (JOS-237), task 4.5 — the real thing: ffmpeg with libass draws the cues over the committed
// fixture. Skipped, not failed, where ffmpeg has no `subtitles` filter (the Homebrew build); run it with FFMPEG_PATH
// set to a build that has libass (the pinned `eugeneware/ffmpeg-static` b6.0 does, see the step-1 report).
//
// The ffmpeg adapter runs ffmpeg synchronously, which blocks this worker's event loop. A long blocked stretch makes
// vitest's worker RPC time out ("Timeout calling onTaskUpdate", 60 s) even though every test passed, as it did on a slow
// CI runner. So every video is built ONCE, in `beforeAll`, with a yield to the event loop between builds, and frames are
// extracted with the asynchronous `execFile`.

const FIXTURE = join(process.cwd(), "..", "openspec", "changes", "archive", "2026-09-26-define-media-assembly", "fixture");
const filters = spawnSync(FFMPEG, ["-hide_banner", "-filters"], { encoding: "utf8" }).stdout ?? "";
const haveSubtitleFilter = /^\s*\S+\s+subtitles\s/m.test(filters);
const haveFixture = spawnSync(FFPROBE, ["-version"]).status === 0 && existsSync(join(FIXTURE, "voice-over.m4a"));

const FPS = 30;
const WIDTH = 1920;
const BAND_TOP = 880; // the subtitle sits in the bottom 200 rows of the 1080 high frame
const BAND_HEIGHT = 200;
const execFileAsync = promisify(execFile);

/** Lets the worker answer vitest's messages between two heavy synchronous steps. */
const yieldToEventLoop = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

const frameCounts = (ends: number[]): number[] => {
  let previous = 0;
  return ends.map((end) => {
    const cumulative = Math.round(end * FPS);
    const count = cumulative - previous;
    previous = cumulative;
    return count;
  });
};

function inputFor(ends: number[], outputPath: string, extra: Partial<AssemblyInput>): AssemblyInput {
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
    width: WIDTH,
    height: 1080,
    ...extra,
  };
}

/** The bottom band of the frame at `seconds`, as raw rgb24. */
async function bandAt(video: string, seconds: number): Promise<Buffer> {
  const { stdout } = await execFileAsync(
    FFMPEG,
    ["-v", "error", "-ss", String(seconds), "-i", video, "-frames:v", "1", "-vf", `crop=${WIDTH}:${BAND_HEIGHT}:0:${BAND_TOP}`, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
    { encoding: "buffer", maxBuffer: 16 * 1024 * 1024 },
  );
  return stdout;
}

interface Pixel {
  x: number;
  y: number;
  r: number;
  g: number;
  b: number;
}

/** The pixels of `band` that differ from the same frame of the unsubtitled build: the subtitle and nothing else. */
function subtitlePixels(band: Buffer, baseline: Buffer): Pixel[] {
  const found: Pixel[] = [];
  for (let index = 0; index < band.length; index += 3) {
    const delta = Math.max(Math.abs(band[index]! - baseline[index]!), Math.abs(band[index + 1]! - baseline[index + 1]!), Math.abs(band[index + 2]! - baseline[index + 2]!));
    if (delta > 90) {
      const pixel = index / 3;
      found.push({ x: pixel % WIDTH, y: Math.floor(pixel / WIDTH), r: band[index]!, g: band[index + 1]!, b: band[index + 2]!, });
    }
  }
  return found;
}

/** The subtitle pixels of `video` at `seconds`, against the same frame of `baseline`. */
async function subtitleAt(video: string, baseline: string, seconds: number): Promise<Pixel[]> {
  return subtitlePixels(await bandAt(video, seconds), await bandAt(baseline, seconds));
}

const isWhite = ({ r, g, b }: Pixel): boolean => r >= 235 && g >= 235 && b >= 235;
const isPink = ({ r, g, b }: Pixel): boolean => r >= 235 && g >= 190 && g <= 222 && b >= 195 && b <= 226; // #FFCDD0 (255, 205, 208), anti-aliased
const extent = (pixels: Pixel[], axis: "x" | "y"): [number, number] => [Math.min(...pixels.map((p) => p[axis])), Math.max(...pixels.map((p) => p[axis]))];

function probe(path: string, entries: string, stream: string): string {
  return execFileSync(FFPROBE, ["-v", "error", "-select_streams", stream, "-show_entries", entries, "-of", "csv=p=0", path], { encoding: "utf8" }).trim();
}

const assemblyFolders = (): number => readdirSync(tmpdir()).filter((name) => name.startsWith("vid4you-assembly-")).length;

describe.skipIf(!haveSubtitleFilter || !haveFixture)("the ffmpeg adapter with subtitles (real ffmpeg with libass, committed fixture)", () => {
  const originalEnds = [2.4, 5.4, 8.4, 11.4, 14.4];
  const editedEnds = [2.4, 4.8, 7.8, 10.8, 13.8];
  const cue = (words: Array<[string, number]>, startSeconds: number, endSeconds: number): SubtitleCue => ({
    startSeconds,
    endSeconds,
    words: words.map(([text, start]) => ({ text, startSeconds: start })),
  });

  // Scene 1's pause loses 0.6 s: the narration is cut at 5.1 s (4.8 s - 5.4 s) and every later scene moves 0.6 s earlier.
  const edits = [{ atSeconds: 5.1, deltaSeconds: -0.6 }];
  const script = "Hello there. Gamma word.";
  const characters = [...script.replace(/\s/gu, "")].map((text, index) => {
    const start = index < 11 ? index * 0.1 : 6 + (index - 11) * 0.1; // "Hello there." from 0 s, "Gamma word." from 6 s
    return { text, start, end: start + 0.1 };
  });
  const editedCues = buildSubtitleCues(script, characters, edits, 13.8);

  let dir = "";
  let foldersBefore = 0;
  const videos = { plain: "", words: "", size: "", edited: "", plainEdited: "" };

  beforeAll(async () => {
    foldersBefore = assemblyFolders();
    dir = mkdtempSync(join(tmpdir(), "vid4you-subtitles-test-"));
    const tool = createFfmpegAssemblyTool();
    const builds: Array<[keyof typeof videos, number[], Partial<AssemblyInput>]> = [
      ["plain", originalEnds, {}],
      ["words", originalEnds, { subtitles: [cue([["alpha", 1], ["bravo", 2.5], ["charlie", 4]], 1, 5.5)] }],
      ["size", originalEnds, { subtitles: [cue([["HHHH", 0.2], ["HHHH", 1.5]], 0.2, 3)] }],
      ["edited", editedEnds, { narrationEdits: edits, subtitles: editedCues }],
      ["plainEdited", editedEnds, { narrationEdits: edits }],
    ];
    for (const [name, ends, extra] of builds) {
      videos[name] = join(dir, `${name}.mp4`);
      const result = await tool.assemble(inputFor(ends, videos[name], extra));
      expect(result.kind).toBe("success");
      await yieldToEventLoop();
    }
  }, 280_000);

  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("draws the line while it is due and the narrated word in pink, moving word by word", async () => {
    const at = (seconds: number): Promise<Pixel[]> => subtitleAt(videos.words, videos.plain, seconds);
    expect(await at(0.5)).toHaveLength(0); // before the line
    expect(await at(6.5)).toHaveLength(0); // after it
    const pinkAt = async (seconds: number): Promise<[number, number]> => {
      const pixels = await at(seconds);
      expect(pixels.filter(isWhite).length).toBeGreaterThan(200);
      const pink = pixels.filter(isPink);
      expect(pink.length).toBeGreaterThan(200);
      return extent(pink, "x");
    };
    const [alphaFrom, alphaTo] = await pinkAt(1.5);
    const [bravoFrom, bravoTo] = await pinkAt(3);
    const [charlieFrom] = await pinkAt(4.7);
    expect(bravoFrom).toBeGreaterThan(alphaTo); // the highlight moved right, and the first word is white again
    expect(charlieFrom).toBeGreaterThan(bravoTo);
    expect(alphaFrom).toBeLessThan(bravoFrom);
  }, 120_000);

  it("keeps the format: the same frames, and the voice-over's audio stream copied", () => {
    expect(probe(videos.words, "stream=nb_frames", "v:0")).toBe(probe(videos.plain, "stream=nb_frames", "v:0"));
    expect(probe(videos.words, "stream=width,height", "v:0")).toBe("1920,1080");
    expect(probe(videos.words, "stream=codec_name", "a:0")).toBe("aac");
    expect(Number(probe(videos.words, "stream=duration", "a:0"))).toBeCloseTo(14.4, 2);
  });

  it("draws capital letters about as tall as a CSS 48 px Montserrat (33.6 px)", async () => {
    const whitePixels = (await subtitleAt(videos.size, videos.plain, 0.8)).filter(isWhite); // the first word is pink, the second white
    const [top, bottom] = extent(whitePixels, "y");
    expect(bottom - top + 1).toBeGreaterThanOrEqual(32);
    expect(bottom - top + 1).toBeLessThanOrEqual(35);
  }, 120_000);

  it("moves the subtitles with a pause edit: a line starts when its narration now starts, in the shorter video", async () => {
    expect(editedCues[1]!.startSeconds).toBeCloseTo(5.4, 6); // was 6.0
    const at = (seconds: number): Promise<Pixel[]> => subtitleAt(videos.edited, videos.plainEdited, seconds);
    expect(await at(5.25)).toHaveLength(0); // the second line is not due yet (it would be, at 6.0 s, without the edit)
    expect((await at(5.6)).length).toBeGreaterThan(500); // it is due from 5.4 s
    expect(Math.abs(Number(probe(videos.edited, "stream=nb_frames", "v:0")) / FPS - Number(probe(videos.edited, "stream=duration", "a:0")))).toBeLessThanOrEqual(1 / FPS);
  }, 120_000);

  it("builds the video when the voice-over and output paths are relative to the working directory (the default PROJECTS_ROOT)", async () => {
    const output = relative(process.cwd(), join(dir, "relative.mp4"));
    const result = await createFfmpegAssemblyTool().assemble(
      inputFor(originalEnds, output, {
        voiceOverPath: relative(process.cwd(), join(FIXTURE, "voice-over.m4a")),
        subtitles: [cue([["alpha", 1]], 1, 2)],
      }),
    );
    expect(result).toEqual({ kind: "success", outputPath: output });
    expect(existsSync(join(dir, "relative.mp4"))).toBe(true);
  }, 120_000);

  it("removes its temporary folders, with the subtitle files and the font copies", () => {
    expect(assemblyFolders()).toBe(foldersBefore);
  });
});
