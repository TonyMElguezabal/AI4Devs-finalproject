// JOS-194 proof of concept (Decision 14) — runs FIRST in the bundle, before any backend module is evaluated.
// Every line here is a stand-in for a follow-up story; product code is not changed (Decision 10).
import childProcess from "node:child_process";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

// Story L2: per-user data folder, never the install folder.
export const dataDir =
  process.env.VID4YOU_DATA_DIR ??
  (process.platform === "win32"
    ? join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "Vid4You")
    : process.platform === "darwin"
      ? join(homedir(), "Library", "Application Support", "Vid4You")
      : join(process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"), "Vid4You"));
mkdirSync(dataDir, { recursive: true });
process.env.DB_PATH ??= join(dataDir, "vid4you.sqlite");
process.env.PROJECTS_ROOT ??= join(dataDir, "projects");

// Story L2: credentials.ts resolves "../../.secrets.json" from `import.meta.dirname`; the bundle defines that name as this global,
// so the file it reads is <dataDir>/.secrets.json.
(globalThis as Record<string, unknown>).__VID4YOU_CREDENTIALS_BASE = join(dataDir, "base", "dir");

// Story L5: a packaged build never exposes test endpoints or stubs, whatever the user's environment says.
// The PoC keeps them only when it is explicitly started in stub mode.
if (process.env.POC_MODE !== "stub") {
  for (const name of Object.keys(process.env)) {
    if (name === "ALLOW_TEST_ENDPOINTS" || name.startsWith("USE_STUB_")) delete process.env[name];
  }
}

// Story S2: ffmpeg/ffprobe ship beside the executable. The backend hard-codes /opt/homebrew/bin/ffmpeg (assembly) and calls
// `ffprobe` from PATH (voice-over), so both names are mapped to the bundled binaries.
const binDir = process.env.VID4YOU_BIN_DIR ?? dirname(process.execPath);
const exe = process.platform === "win32" ? ".exe" : "";
export const ffmpegPath = join(binDir, `ffmpeg${exe}`);
export const ffprobePath = join(binDir, `ffprobe${exe}`);
const mapBinary = (file: string) =>
  file === "/opt/homebrew/bin/ffmpeg" || file === "ffmpeg" ? ffmpegPath
    : file === "/opt/homebrew/bin/ffprobe" || file === "ffprobe" ? ffprobePath
      : file;
const realExecFile = childProcess.execFile;
const realExecFileSync = childProcess.execFileSync;
const execFileShim = (file: string, ...rest: unknown[]) => (realExecFile as (...args: unknown[]) => unknown)(mapBinary(file), ...rest);
// voiceOverPhase.ts calls promisify(execFile) and reads `{ stdout }`: keep execFile's custom promisified form.
const realExecFilePromise = (realExecFile as unknown as Record<symbol, (...args: unknown[]) => unknown>)[promisify.custom];
(execFileShim as unknown as Record<symbol, unknown>)[promisify.custom] = (file: string, ...rest: unknown[]) => realExecFilePromise(mapBinary(file), ...rest);
(childProcess as { execFile: unknown }).execFile = execFileShim;
(childProcess as { execFileSync: unknown }).execFileSync = (file: string, ...rest: unknown[]) =>
  (realExecFileSync as (...args: unknown[]) => unknown)(mapBinary(file), ...rest);
