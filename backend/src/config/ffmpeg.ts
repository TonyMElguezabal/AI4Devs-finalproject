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
