import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildRuntimeEnvironment, resolveDataDir, sanitizeEnvironment } from "../packaging/runtimeEnv.ts";

// package-executables-build (JOS-205), tasks 1.2 and 1.3.
describe("resolveDataDir", () => {
  it("is Application Support on macOS", () => {
    expect(resolveDataDir({ platform: "darwin", env: {}, home: "/Users/ana" })).toBe(join("/Users/ana", "Library", "Application Support", "Vid4You"));
  });

  it("is %APPDATA% on Windows", () => {
    expect(resolveDataDir({ platform: "win32", env: { APPDATA: "C:\\Users\\ana\\AppData\\Roaming" }, home: "C:\\Users\\ana" }))
      .toBe(join("C:\\Users\\ana\\AppData\\Roaming", "Vid4You"));
  });

  it("falls back to AppData/Roaming under the home folder on Windows when APPDATA is unset", () => {
    expect(resolveDataDir({ platform: "win32", env: {}, home: "C:\\Users\\ana" })).toBe(join("C:\\Users\\ana", "AppData", "Roaming", "Vid4You"));
  });

  it("is VID4YOU_DATA_DIR when set, on every platform", () => {
    expect(resolveDataDir({ platform: "darwin", env: { VID4YOU_DATA_DIR: "/tmp/data" }, home: "/Users/ana" })).toBe("/tmp/data");
    expect(resolveDataDir({ platform: "win32", env: { VID4YOU_DATA_DIR: "D:\\data" }, home: "C:\\Users\\ana" })).toBe("D:\\data");
  });
});

describe("sanitizeEnvironment", () => {
  it("removes ALLOW_TEST_ENDPOINTS and every USE_STUB_* variable and keeps the rest", () => {
    const env: Record<string, string | undefined> = {
      ALLOW_TEST_ENDPOINTS: "1",
      USE_STUB_VOICE_PROVIDER: "success",
      USE_STUB_ASSEMBLY_TOOL: "success",
      OPENAI_API_KEY: "kept",
      PATH: "/usr/bin",
    };
    sanitizeEnvironment(env);
    expect(env).toEqual({ OPENAI_API_KEY: "kept", PATH: "/usr/bin" });
  });
});

describe("buildRuntimeEnvironment", () => {
  const dataDir = join("/data", "Vid4You");
  const binDir = join("/apps", "Vid4You");

  it("puts every stored item under the data folder and the tools beside the executable", () => {
    const env = buildRuntimeEnvironment({ dataDir, binDir, platform: "darwin" });
    expect(env).toEqual({
      DB_PATH: join(dataDir, "vid4you.sqlite"),
      PROJECTS_ROOT: join(dataDir, "projects"),
      SECRETS_PATH: join(dataDir, ".secrets.json"),
      SETTINGS_PATH: join(dataDir, "settings.json"),
      PROVIDER_KEY_PATH: join(dataDir, "provider-keys.key"),
      SETTINGS_DEFAULTS_PATH: join(dataDir, "runtime", "settings.default.json"),
      SUBTITLE_FONT_PATH: join(dataDir, "runtime", "Montserrat-Bold.ttf"),
      FFMPEG_PATH: join(binDir, "ffmpeg"),
      FFPROBE_PATH: join(binDir, "ffprobe"),
    });
  });

  it("uses .exe tool names on Windows", () => {
    const env = buildRuntimeEnvironment({ dataDir, binDir, platform: "win32" });
    expect(env.FFMPEG_PATH).toBe(join(binDir, "ffmpeg.exe"));
    expect(env.FFPROBE_PATH).toBe(join(binDir, "ffprobe.exe"));
  });
});
