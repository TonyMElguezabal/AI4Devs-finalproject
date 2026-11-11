import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FFMPEG } from "../src/config/ffmpeg.ts";

// check-generated-clip (JOS-265): real MP4 clips for the tests, made with ffmpeg at one frame per second so each is a few kB.
// Cached per shape for the whole test file.
const cache = new Map<string, Buffer>();

export function makeClip(width: number, height: number, seconds: number): Buffer {
  const key = `${width}x${height}:${seconds}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const folder = mkdtempSync(join(tmpdir(), "vid4you-clip-fixture-"));
  try {
    const file = join(folder, "clip.mp4");
    execFileSync(FFMPEG, ["-v", "error", "-f", "lavfi", "-i", `color=black:s=${width}x${height}:d=${seconds}:r=1`, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", file]);
    const bytes = readFileSync(file);
    cache.set(key, bytes);
    return bytes;
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}
