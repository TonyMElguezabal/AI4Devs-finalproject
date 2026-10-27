import { homedir } from "node:os";
import { join } from "node:path";

// package-executables-build (JOS-205) Decisions 5 and 6 — where the packaged app keeps its data and what it ignores.
type Env = Record<string, string | undefined>;

/** ADR 0007: a per-user folder, never the install folder. `VID4YOU_DATA_DIR` overrides it on every platform. */
export function resolveDataDir(options: { platform: NodeJS.Platform; env: Env; home?: string }): string {
  const { platform, env } = options;
  const home = options.home ?? homedir();
  if (env.VID4YOU_DATA_DIR) return env.VID4YOU_DATA_DIR;
  if (platform === "win32") return join(env.APPDATA ?? join(home, "AppData", "Roaming"), "Vid4You");
  if (platform === "darwin") return join(home, "Library", "Application Support", "Vid4You");
  return join(env.XDG_DATA_HOME ?? join(home, ".local", "share"), "Vid4You"); // not a shipped target (ADR 0007)
}

/** A packaged build never exposes test endpoints or stubs, whatever the user's environment says. Mutates and returns `env`. */
export function sanitizeEnvironment(env: Env): Env {
  for (const name of Object.keys(env)) {
    if (name === "ALLOW_TEST_ENDPOINTS" || name.startsWith("USE_STUB_")) delete env[name];
  }
  return env;
}

export interface RuntimeEnvironment {
  DB_PATH: string;
  PROJECTS_ROOT: string;
  SECRETS_PATH: string;
  SETTINGS_PATH: string;
  PROVIDER_KEY_PATH: string;
  SETTINGS_DEFAULTS_PATH: string;
  FFMPEG_PATH: string;
  FFPROBE_PATH: string;
}

/** The environment variables the backend reads for its locations; assigned over whatever the user's environment holds. */
export function buildRuntimeEnvironment(options: { dataDir: string; binDir: string; platform: NodeJS.Platform }): RuntimeEnvironment {
  const { dataDir, binDir, platform } = options;
  const exe = platform === "win32" ? ".exe" : "";
  return {
    DB_PATH: join(dataDir, "vid4you.sqlite"),
    PROJECTS_ROOT: join(dataDir, "projects"),
    SECRETS_PATH: join(dataDir, ".secrets.json"),
    SETTINGS_PATH: join(dataDir, "settings.json"),
    PROVIDER_KEY_PATH: join(dataDir, "provider-keys.key"),
    SETTINGS_DEFAULTS_PATH: join(dataDir, "runtime", "settings.default.json"),
    FFMPEG_PATH: join(binDir, `ffmpeg${exe}`),
    FFPROBE_PATH: join(binDir, `ffprobe${exe}`),
  };
}
