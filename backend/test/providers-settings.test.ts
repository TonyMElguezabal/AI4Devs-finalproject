import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// configure-providers-and-parameters (JOS-174), group 3 — design Decision 3:
// `providers.ts` loads the settings once, when the module is first imported,
// and derives its exports from them. Each test imports a fresh copy with
// `SETTINGS_PATH` pointing at a scratch override.

let dir: string;
let savedSettingsPath: string | undefined;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "vid4you-providers-"));
  savedSettingsPath = process.env.SETTINGS_PATH;
});

afterEach(() => {
  if (savedSettingsPath === undefined) delete process.env.SETTINGS_PATH;
  else process.env.SETTINGS_PATH = savedSettingsPath;
  vi.resetModules();
  rmSync(dir, { recursive: true, force: true });
});

/** Imports a fresh `providers.ts`. With no override, the path points at a file that does not exist. */
async function importProviders(override?: unknown) {
  const overridePath = join(dir, "settings.json");
  if (override !== undefined) writeFileSync(overridePath, typeof override === "string" ? override : JSON.stringify(override));
  process.env.SETTINGS_PATH = overridePath;
  vi.resetModules();
  return import("../src/config/providers.ts");
}

describe("With no override file", () => {
  it("exports today's recorded values", async () => {
    const providers = await importProviders();
    expect(providers.DECOMPOSITION_PROVIDER).toEqual({ name: "OpenAI", model: "gpt-6-astra" });
    expect(providers.VIDEO_ADMITTED_DURATION_SECONDS).toEqual({ min: 5, max: 15 });
    expect(providers.VIDEO_ADMITTED_DURATIONS_SECONDS).toEqual([5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    expect(providers.SEGMENTATION_LOWER_BOUND_SECONDS).toBe(5);
    expect(providers.SEGMENTATION_UPPER_BOUND_SECONDS).toBe(15);
    expect(providers.SUPPORTED_LANGUAGE_CODES).toEqual(["en", "es"]);
    expect(providers.MAX_SIMULTANEOUS_REQUESTS).toEqual({ decomposition: 50, image: 6, voice: 4, alignment: 2, video: 4 });
    expect(providers.PER_PHASE_MAX_TIME_SECONDS).toEqual({
      decomposition: 600,
      image: 300,
      voice: 600,
      alignment: 5,
      video: 1200,
      assembly: "undetermined",
    });
    expect(providers.SPEED_FACTOR_LIMIT).toBe(2);
    expect(providers.FINAL_OUTPUT).toEqual({ width: 1920, height: 1080, fps: 30, videoCodec: "H.264", audioCodec: "AAC" });
  });
});

describe("With an override file", () => {
  it("exports the configured request cap and maximum time", async () => {
    const providers = await importProviders({ maxSimultaneousRequests: { video: 1 }, maxTimeSeconds: { image: 40 } });
    expect(providers.MAX_SIMULTANEOUS_REQUESTS.video).toBe(1);
    expect(providers.MAX_SIMULTANEOUS_REQUESTS.voice).toBe(4);
    expect(providers.PER_PHASE_MAX_TIME_SECONDS.image).toBe(40);
    expect(providers.PER_PHASE_MAX_TIME_SECONDS.video).toBe(1200);
  });

  it("derives the admitted durations and the segmentation bounds from the configured range", async () => {
    const providers = await importProviders({
      video: { admittedDurationSeconds: { min: 6, max: 10 } },
      segmentation: { lowerBoundSeconds: 6 },
    });
    expect(providers.VIDEO_ADMITTED_DURATION_SECONDS).toEqual({ min: 6, max: 10 });
    expect(providers.VIDEO_ADMITTED_DURATIONS_SECONDS).toEqual([6, 7, 8, 9, 10]);
    expect(providers.SEGMENTATION_LOWER_BOUND_SECONDS).toBe(6);
    expect(providers.SEGMENTATION_UPPER_BOUND_SECONDS).toBe(10);
  });

  it("exports the configured languages, in both forms", async () => {
    const providers = await importProviders({ languages: [{ code: "fr", label: "Français" }] });
    expect(providers.SUPPORTED_LANGUAGE_CODES).toEqual(["fr"]);
    expect(providers.SUPPORTED_LANGUAGES).toEqual([{ code: "fr", label: "Français" }]);
  });

  it("exports the configured providers, voice settings and output size", async () => {
    const providers = await importProviders({
      image: { model: "another-image-model" },
      voice: { voiceId: "another-voice", speed: 1.1 },
      output: { width: 1280, height: 720, fps: 24 },
    });
    expect(providers.IMAGE_PROVIDER).toEqual({ name: "Fal.ai", model: "another-image-model" });
    expect(providers.VOICE_PROVIDER.voiceId).toBe("another-voice");
    expect(providers.VOICE_PROVIDER.speed).toBe(1.1);
    expect(providers.VOICE_PROVIDER.outputFormat).toBe("mp3_44100_128");
    expect(providers.FINAL_OUTPUT).toEqual({ width: 1280, height: 720, fps: 24, videoCodec: "H.264", audioCodec: "AAC" });
  });

  it("keeps the values outside the configurable list as they were", async () => {
    const providers = await importProviders({ maxSimultaneousRequests: { video: 1 } });
    expect(providers.MAX_ATTEMPTS_PER_CYCLE).toBe(4);
    expect(providers.IMAGE_GENERATION_SIZE).toEqual({ width: 1920, height: 1088 });
    expect(providers.SCRIPT_MODERATION).toEqual({ name: "OpenAI", model: "omni-moderation-2024-09-26" });
  });
});

describe("A maximum time of null means the stage is not timed (design Decision 3)", () => {
  it("is exported as the undetermined marker, and its timeout is undefined", async () => {
    const providers = await importProviders({ maxTimeSeconds: { image: null } });
    expect(providers.PER_PHASE_MAX_TIME_SECONDS.image).toBe("undetermined");
    expect(providers.phaseTimeoutMs("image")).toBeUndefined();
  });

  it("gives a timed stage its limit in milliseconds", async () => {
    const providers = await importProviders({ maxTimeSeconds: { image: 40 } });
    expect(providers.phaseTimeoutMs("image")).toBe(40_000);
    expect(providers.phaseTimeoutMs("video")).toBe(1_200_000);
  });

  it("leaves assembly untimed by default", async () => {
    const providers = await importProviders();
    expect(providers.phaseTimeoutMs("assembly")).toBeUndefined();
  });
});

describe("An invalid override stops the module from loading", () => {
  it("throws one error that lists every problem and prints no value", async () => {
    const secret = "sk-test-secret-value";
    await expect(importProviders({ languages: [], maxSimultaneousRequests: { video: 0 }, openaiApiKey: secret })).rejects.toSatisfy(
      (error: unknown) => {
        const message = error instanceof Error ? error.message : "";
        return (
          message.includes("languages: ") &&
          message.includes("maxSimultaneousRequests.video: ") &&
          message.includes("openaiApiKey: ") &&
          !message.includes(secret)
        );
      },
    );
  });

  it("names the override file when it is not valid JSON", async () => {
    await expect(importProviders("{ not json")).rejects.toThrow(/could not be parsed as JSON/);
  });
});

// JOS-174 AC4 and spec "Settings take effect only after a restart".
describe("Settings are read once, at start-up", () => {
  it("ignores an edit to the override file made while the app is running, until it restarts", async () => {
    const providers = await importProviders({ maxSimultaneousRequests: { video: 2 }, maxTimeSeconds: { image: 40 } });
    expect(providers.MAX_SIMULTANEOUS_REQUESTS.video).toBe(2);
    expect(providers.phaseTimeoutMs("image")).toBe(40_000);

    writeFileSync(join(dir, "settings.json"), JSON.stringify({ maxSimultaneousRequests: { video: 1 }, maxTimeSeconds: { image: 90 } }));

    // The running process: the already-loaded module, and a plain re-import of it, both keep the start-up values.
    expect(providers.MAX_SIMULTANEOUS_REQUESTS.video).toBe(2);
    expect(providers.phaseTimeoutMs("image")).toBe(40_000);
    const sameModule = await import("../src/config/providers.ts");
    expect(sameModule.MAX_SIMULTANEOUS_REQUESTS.video).toBe(2);

    // A restart (a fresh module graph) reads the edited file.
    vi.resetModules();
    const restarted = await import("../src/config/providers.ts");
    expect(restarted.MAX_SIMULTANEOUS_REQUESTS.video).toBe(1);
    expect(restarted.phaseTimeoutMs("image")).toBe(90_000);
  });

  it("offers no route to read or change the settings through the application", async () => {
    await importProviders();
    const { buildApp } = await import("../src/server.ts");
    const app = await buildApp();
    try {
      await app.ready();
      for (const method of ["GET", "PUT", "POST", "PATCH", "DELETE"] as const) {
        // `/admin/settings` is left out: admin-visual-style-prompt (JOS-201) uses it for the visual style, behind the
        // Administrator gate, and it holds none of these settings.
        for (const url of ["/settings", "/admin", "/config", "/providers"]) {
          const response = await app.inject({ method, url, payload: method === "GET" ? undefined : { maxSimultaneousRequests: { video: 1 } } });
          expect(response.statusCode, `${method} ${url}`).toBe(404);
        }
      }
    } finally {
      await app.close();
    }
  });
});
