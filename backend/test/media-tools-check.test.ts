import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { classifyToolStartFailure, ffmpegHasSubtitleFilter, resetSubtitleFilterCheck } from "../src/config/ffmpeg.ts";
import { checkMediaTools } from "../src/mediaToolsCheck.ts";

// detect-blocked-media-tools (JOS-271), group 1 — what "the tool could not start" means, the readiness check, and
// the subtitle-filter answer that is never remembered when it is negative.

const FILTERS_WITH_SUBTITLES = " ... ass               V->V       Render ASS subtitles.\n ... subtitles         V->V       Render text subtitles onto input video using the libass library.\n";
const FILTERS_WITHOUT_SUBTITLES = " ... scale             V->V       Scale the input video.\n";

describe("classifyToolStartFailure", () => {
  it("calls a missing executable missing", () => {
    expect(classifyToolStartFailure({ code: "ENOENT" })).toBe("missing");
  });

  it.each([
    ["a process killed by the operating system (execFile)", { signal: "SIGKILL", code: null }],
    ["a process killed by the operating system (execFileSync)", { signal: "SIGKILL", status: null }],
    ["a refused permission to execute", { code: "EPERM" }],
    ["a missing execute bit", { code: "EACCES" }],
  ])("calls %s blocked", (_name, error) => {
    expect(classifyToolStartFailure(error)).toBe("blocked");
  });

  it("calls a tool that ran and failed failed, and anything unknown failed", () => {
    expect(classifyToolStartFailure({ code: 1 })).toBe("failed");
    expect(classifyToolStartFailure({ status: 1, signal: null })).toBe("failed");
    expect(classifyToolStartFailure("boom")).toBe("failed");
  });
});

describe("ffmpegHasSubtitleFilter remembers only a positive answer", () => {
  beforeEach(() => resetSubtitleFilterCheck());
  afterEach(() => resetSubtitleFilterCheck());

  it("asks again after a failed check, so removing the block needs no restart", () => {
    let blocked = true;
    const run = () => {
      if (blocked) throw Object.assign(new Error("killed"), { signal: "SIGKILL", status: null });
      return FILTERS_WITH_SUBTITLES;
    };

    expect(ffmpegHasSubtitleFilter(run)).toBe(false);
    blocked = false;
    expect(ffmpegHasSubtitleFilter(run)).toBe(true);
  });

  it("asks again after a build without the filter", () => {
    let output = FILTERS_WITHOUT_SUBTITLES;
    const run = () => output;

    expect(ffmpegHasSubtitleFilter(run)).toBe(false);
    output = FILTERS_WITH_SUBTITLES;
    expect(ffmpegHasSubtitleFilter(run)).toBe(true);
  });

  it("does not start ffmpeg again once the answer was positive", () => {
    let calls = 0;
    const run = () => {
      calls += 1;
      return FILTERS_WITH_SUBTITLES;
    };

    expect(ffmpegHasSubtitleFilter(run)).toBe(true);
    expect(ffmpegHasSubtitleFilter(run)).toBe(true);
    expect(calls).toBe(1);
  });
});

// Real executables, so a blocked tool is a process that really is killed (what Gatekeeper does), not a mock.
describe.skipIf(process.platform === "win32")("checkMediaTools", () => {
  let folder: string;

  beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), "vid4you-media-tools-"));
  });
  afterEach(() => rmSync(folder, { recursive: true, force: true }));

  function tool(name: string, script: string): string {
    const path = join(folder, name);
    writeFileSync(path, `#!/bin/sh\n${script}\n`);
    chmodSync(path, 0o755);
    return path;
  }
  const ffmpegPrinting = (filters: string) => tool("ffmpeg", `if [ "$2" = "-filters" ]; then printf '%s' '${filters}'; fi`);
  const workingFfprobe = () => tool("ffprobe", "echo ffprobe version test");
  const killedTool = (name: string) => tool(name, "kill -9 $$");

  it("is ready when both tools run and ffmpeg lists the subtitles filter", async () => {
    const status = await checkMediaTools({ ffmpeg: ffmpegPrinting(FILTERS_WITH_SUBTITLES), ffprobe: workingFfprobe() }, {});

    expect(status).toEqual({ ok: true });
  });

  it("names ffprobe and the fix when ffprobe is killed, without a file path", async () => {
    const status = await checkMediaTools({ ffmpeg: ffmpegPrinting(FILTERS_WITH_SUBTITLES), ffprobe: killedTool("ffprobe") }, {});

    expect(status).toMatchObject({ ok: false, problem: "blocked", tool: "ffprobe" });
    if (status.ok) throw new Error("expected a failure");
    expect(status.message).toContain("ffprobe");
    expect(status.message).toContain("xattr -dr com.apple.quarantine");
    expect(status.message).not.toContain(folder);
  });

  it("names ffmpeg when ffmpeg is killed", async () => {
    const status = await checkMediaTools({ ffmpeg: killedTool("ffmpeg"), ffprobe: workingFfprobe() }, {});

    expect(status).toMatchObject({ ok: false, problem: "blocked", tool: "ffmpeg" });
  });

  it("names ffmpeg as missing when it cannot be found", async () => {
    const status = await checkMediaTools({ ffmpeg: join(folder, "no-such-ffmpeg"), ffprobe: workingFfprobe() }, {});

    expect(status).toMatchObject({ ok: false, problem: "missing", tool: "ffmpeg" });
    if (status.ok) throw new Error("expected a failure");
    expect(status.message).not.toContain(folder);
  });

  it("says ffmpeg cannot draw subtitles when the filter is not listed", async () => {
    const status = await checkMediaTools({ ffmpeg: ffmpegPrinting(FILTERS_WITHOUT_SUBTITLES), ffprobe: workingFfprobe() }, {});

    expect(status).toMatchObject({ ok: false, problem: "no-subtitle-filter", tool: "ffmpeg" });
  });

  it("is skipped when the assembly tool is a stub for manual testing", async () => {
    const status = await checkMediaTools({ ffmpeg: killedTool("ffmpeg"), ffprobe: killedTool("ffprobe") }, { USE_STUB_ASSEMBLY_TOOL: "success" });

    expect(status).toEqual({ ok: true });
  });
});
