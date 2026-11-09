import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

// Where the assembly adapter finds ffmpeg and ffprobe. `FFMPEG_PATH` / `FFPROBE_PATH` win; otherwise the Homebrew
// binary when it exists (the macOS development default), otherwise the name on PATH (Linux, CI, Windows).
// The packaged app's launcher maps both the Homebrew path and the bare names to its bundled binaries.
const HOMEBREW_DIR = "/opt/homebrew/bin";

export function resolveTool(
  name: "ffmpeg" | "ffprobe",
  env: Record<string, string | undefined> = process.env,
  exists: (path: string) => boolean = existsSync,
): string {
  const override = env[`${name.toUpperCase()}_PATH`];
  if (override) return override;
  const homebrew = `${HOMEBREW_DIR}/${name}`;
  return exists(homebrew) ? homebrew : name;
}

export const FFMPEG = resolveTool("ffmpeg");
export const FFPROBE = resolveTool("ffprobe");

/** Why a tool could not be used: it is not there, the operating system refused or killed it, or something else went wrong. */
export type ToolStartFailure = "missing" | "blocked" | "failed";

/**
 * detect-blocked-media-tools (JOS-271) Decision 3 — what an `execFile` error says about starting the tool. A missing
 * executable is `ENOENT`; Gatekeeper kills a quarantined unsigned binary with `SIGKILL`, and a refused execute is
 * `EPERM`/`EACCES`. A tool that ran and exited with an error (a numeric exit code) is not a start failure: `failed`.
 */
export function classifyToolStartFailure(error: unknown): ToolStartFailure {
  const { code, signal } = (typeof error === "object" && error !== null ? error : {}) as { code?: unknown; signal?: unknown };
  if (code === "ENOENT") return "missing";
  if (signal === "SIGKILL" || code === "EPERM" || code === "EACCES") return "blocked";
  return "failed";
}

let subtitleFilterAvailable: boolean | undefined;

const listFilters = (): string => execFileSync(FFMPEG, ["-hide_banner", "-filters"], { encoding: "utf8" });

/**
 * Whether the ffmpeg in use lists the `subtitles` filter (it needs libass; the Homebrew build does not have it). Only a
 * positive answer is remembered: a negative one, from a tool that could not run or has no such filter, is asked again,
 * so that removing the cause needs no restart (JOS-271 Decision 5). An ffmpeg that cannot even be run counts as having none.
 */
export function ffmpegHasSubtitleFilter(run: () => string = listFilters): boolean {
  if (subtitleFilterAvailable !== true) {
    try {
      subtitleFilterAvailable = /^\s*\S+\s+subtitles\s/m.test(run());
    } catch {
      // ffmpeg missing, blocked or failing: no subtitle filter, which the boot log warns about.
      subtitleFilterAvailable = false;
    }
  }
  return subtitleFilterAvailable;
}

/** Test hook: forget the remembered answer. */
export function resetSubtitleFilterCheck(): void {
  subtitleFilterAvailable = undefined;
}
