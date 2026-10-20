import { describe, expect, it } from "vitest";
import { resolveTool } from "../src/config/ffmpeg.ts";

describe("resolveTool", () => {
  it("prefers FFMPEG_PATH / FFPROBE_PATH", () => {
    expect(resolveTool("ffmpeg", { FFMPEG_PATH: "/custom/ffmpeg" }, () => true)).toBe("/custom/ffmpeg");
    expect(resolveTool("ffprobe", { FFPROBE_PATH: "C:\\tools\\ffprobe.exe" }, () => true)).toBe("C:\\tools\\ffprobe.exe");
  });
  it("uses the Homebrew binary when it exists", () => {
    expect(resolveTool("ffmpeg", {}, (path) => path === "/opt/homebrew/bin/ffmpeg")).toBe("/opt/homebrew/bin/ffmpeg");
  });
  it("falls back to the name on PATH when Homebrew has none (Linux, CI)", () => {
    expect(resolveTool("ffmpeg", {}, () => false)).toBe("ffmpeg");
    expect(resolveTool("ffprobe", {}, () => false)).toBe("ffprobe");
  });
  it("ignores an empty override", () => {
    expect(resolveTool("ffmpeg", { FFMPEG_PATH: "" }, () => false)).toBe("ffmpeg");
  });
});
