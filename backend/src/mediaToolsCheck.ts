import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { classifyToolStartFailure, FFMPEG, FFPROBE, type ToolStartFailure } from "./config/ffmpeg.ts";

const execFileAsync = promisify(execFile);

// detect-blocked-media-tools (JOS-271), design Decisions 1-3 — before a session is accepted (and so before any paid
// provider request), ffmpeg and ffprobe must be able to run, and ffmpeg must list the `subtitles` filter. A failure is
// a typed outcome carrying a message the User can act on; the message never contains a file path.

export type MediaTool = "ffmpeg" | "ffprobe";

export type MediaToolsStatus =
  | { ok: true }
  | { ok: false; problem: ToolStartFailure | "no-subtitle-filter"; tool: MediaTool; message: string };

export type MediaToolsCheck = () => Promise<MediaToolsStatus>;

const CHECK_TIMEOUT_MS = 10_000;
const SUBTITLES_FILTER = /^\s*\S+\s+subtitles\s/m;

/** What the User is told about a tool that could not start (JOS-271 Decision 3); shared with the audio check. */
export function describeToolProblem(problem: ToolStartFailure, tool: MediaTool): string {
  if (problem === "blocked") {
    return `The operating system blocked ${tool}, so the video could not be assembled. On macOS, run this in a terminal and try again: xattr -dr com.apple.quarantine <the Vid4You folder>`;
  }
  if (problem === "missing") return `${tool} was not found. Reinstall Vid4You, or set ${tool.toUpperCase()}_PATH to a working ${tool}, and try again.`;
  return `${tool} could not run. Reinstall Vid4You and try again.`;
}

async function start(path: string, args: string[]): Promise<{ ok: true; stdout: string } | { ok: false; problem: ToolStartFailure }> {
  try {
    const { stdout } = await execFileAsync(path, args, { encoding: "utf8", timeout: CHECK_TIMEOUT_MS });
    return { ok: true, stdout };
  } catch (error) {
    return { ok: false, problem: classifyToolStartFailure(error) };
  }
}

/** Runs both tools once. `USE_STUB_ASSEMBLY_TOOL` (manual testing) skips the check, as it does the boot warning. */
export async function checkMediaTools(
  tools: { ffmpeg: string; ffprobe: string } = { ffmpeg: FFMPEG, ffprobe: FFPROBE },
  env: Record<string, string | undefined> = process.env,
): Promise<MediaToolsStatus> {
  if (env.USE_STUB_ASSEMBLY_TOOL) return { ok: true };

  const ffmpeg = await start(tools.ffmpeg, ["-hide_banner", "-filters"]);
  if (!ffmpeg.ok) return { ok: false, problem: ffmpeg.problem, tool: "ffmpeg", message: describeToolProblem(ffmpeg.problem, "ffmpeg") };
  const ffprobe = await start(tools.ffprobe, ["-version"]);
  if (!ffprobe.ok) return { ok: false, problem: ffprobe.problem, tool: "ffprobe", message: describeToolProblem(ffprobe.problem, "ffprobe") };
  if (!SUBTITLES_FILTER.test(ffmpeg.stdout)) {
    return {
      ok: false,
      problem: "no-subtitle-filter",
      tool: "ffmpeg",
      message: "This ffmpeg cannot draw subtitles (it was built without libass), so every video would fail at the end. Use an ffmpeg build that has it, for example through FFMPEG_PATH.",
    };
  }
  return { ok: true };
}

let check: MediaToolsCheck = () => checkMediaTools();

export function getMediaToolsCheck(): MediaToolsCheck {
  return check;
}

export function setMediaToolsCheck(next: MediaToolsCheck): void {
  check = next;
}

export function resetMediaToolsCheck(): void {
  check = () => checkMediaTools();
}
