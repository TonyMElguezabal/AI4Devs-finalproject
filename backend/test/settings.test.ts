import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadSettings } from "../src/config/settings.ts";

// configure-providers-and-parameters (JOS-174), group 2 — design Decisions 1,
// 2, 4 and 5; spec `provider-and-parameter-settings`. `loadSettings` is a pure
// function of two files, so every test writes scratch files and never touches
// the shipped defaults (those are checked in "The shipped defaults file").

type Json = Record<string, unknown>;

/** A complete, valid settings object. Each test changes a copy of it. */
function validSettings(): Json {
  return {
    decomposition: { name: "OpenAI", model: "model-a" },
    voice: {
      name: "ElevenLabs",
      model: "voice-model",
      voiceId: "voice-id",
      voiceName: "A Voice",
      outputFormat: "mp3_44100_128",
      speed: "default",
    },
    alignment: { name: "ElevenLabs", endpoint: "/v1/forced-alignment" },
    image: { name: "Fal.ai", model: "image-model" },
    imageReferenceModel: "reference-model",
    video: { name: "RunningHub", endpoint: "/video/endpoint", admittedDurationSeconds: { min: 5, max: 15 } },
    segmentation: { lowerBoundSeconds: 5 },
    speedFactorLimit: 2,
    maxTimeSeconds: { decomposition: 600, image: 25, voice: 600, alignment: 5, video: 1200, assembly: null },
    maxSimultaneousRequests: { decomposition: 50, image: 200, voice: 3, alignment: 2, video: 3 },
    output: { width: 1920, height: 1080, fps: 30 },
    languages: [
      { code: "en", label: "English" },
      { code: "es", label: "Español" },
    ],
  };
}

let dir: string;
let defaultsPath: string;
let overridePath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "vid4you-settings-"));
  defaultsPath = join(dir, "settings.default.json");
  overridePath = join(dir, "data", "settings.json");
  mkdirSync(join(dir, "data"));
  writeFileSync(defaultsPath, JSON.stringify(validSettings()));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function writeOverride(override: unknown): void {
  writeFileSync(overridePath, typeof override === "string" ? override : JSON.stringify(override));
}

function problemsOf(result: ReturnType<typeof loadSettings>): string[] {
  if (result.ok) throw new Error("expected the settings to be rejected");
  return result.problems;
}

describe("Reading the two files (Decision 1)", () => {
  it("returns the defaults when no override file exists", () => {
    const result = loadSettings({ defaultsPath, overridePath });
    expect(result).toEqual({ ok: true, settings: validSettings() });
  });

  it("replaces only the keys a partial override sets", () => {
    writeOverride({ maxSimultaneousRequests: { video: 2 } });
    const result = loadSettings({ defaultsPath, overridePath });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.settings.maxSimultaneousRequests).toEqual({ decomposition: 50, image: 200, voice: 3, alignment: 2, video: 2 });
    expect(result.settings.maxTimeSeconds).toEqual(validSettings().maxTimeSeconds);
  });

  it("replaces an array whole instead of appending to it", () => {
    writeOverride({ languages: [{ code: "en", label: "English" }] });
    const result = loadSettings({ defaultsPath, overridePath });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.settings.languages).toEqual([{ code: "en", label: "English" }]);
  });

  it("reports an override that is not JSON as one problem naming its path", () => {
    writeOverride("{ not json");
    const problems = problemsOf(loadSettings({ defaultsPath, overridePath }));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(overridePath);
    expect(problems[0]).toContain("could not be parsed");
  });

  it("reports a defaults file that is missing, naming its path", () => {
    const missing = join(dir, "no-such-defaults.json");
    const problems = problemsOf(loadSettings({ defaultsPath: missing, overridePath }));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(missing);
  });
});

describe("Providers (Decision 4)", () => {
  it("rejects a provider the stage has no adapter for, naming the setting and the accepted names", () => {
    writeOverride({ image: { name: "Acme" } });
    const problems = problemsOf(loadSettings({ defaultsPath, overridePath }));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^image\.name: /);
    expect(problems[0]).toContain("Fal.ai");
    expect(problems[0]).not.toContain("Acme");
  });

  it("accepts a changed model identifier on the selected provider", () => {
    writeOverride({ decomposition: { model: "another-model" } });
    const result = loadSettings({ defaultsPath, overridePath });
    expect(result.ok && result.settings.decomposition).toEqual({ name: "OpenAI", model: "another-model" });
  });
});

describe("Field rules and consistency checks (Decisions 2 and 5)", () => {
  // Each case breaks exactly one rule and expects exactly one problem, named by its dotted path.
  const cases: Array<{ name: string; override: Json; path: string; mentions?: string }> = [
    {
      name: "a segmentation lower bound below the admitted minimum",
      override: { video: { admittedDurationSeconds: { min: 6 } }, segmentation: { lowerBoundSeconds: 5 } },
      path: "segmentation.lowerBoundSeconds",
      mentions: "video.admittedDurationSeconds.min",
    },
    {
      name: "an admitted minimum above the admitted maximum",
      override: { video: { admittedDurationSeconds: { min: 12, max: 8 } }, segmentation: { lowerBoundSeconds: 12 } },
      path: "video.admittedDurationSeconds.min",
      mentions: "video.admittedDurationSeconds.max",
    },
    { name: "an empty language list", override: { languages: [] }, path: "languages" },
    {
      name: "duplicate language codes",
      override: {
        languages: [
          { code: "en", label: "English" },
          { code: "en", label: "English again" },
        ],
      },
      path: "languages",
    },
    { name: "a language code that is not two lowercase letters", override: { languages: [{ code: "EN", label: "English" }] }, path: "languages.0.code" },
    { name: "an odd output width", override: { output: { width: 1921 } }, path: "output.width" },
    { name: "an odd output height", override: { output: { height: 1081 } }, path: "output.height" },
    { name: "a request cap of 0", override: { maxSimultaneousRequests: { video: 0 } }, path: "maxSimultaneousRequests.video" },
    { name: "a voice speed of 1.5", override: { voice: { speed: 1.5 } }, path: "voice.speed" },
    { name: "a speed-factor limit below 1", override: { speedFactorLimit: 0.5 }, path: "speedFactorLimit" },
    { name: "a negative maximum time", override: { maxTimeSeconds: { image: -1 } }, path: "maxTimeSeconds.image" },
    { name: "an empty voice id", override: { voice: { voiceId: "" } }, path: "voice.voiceId" },
    { name: "a maximum time of the wrong type", override: { maxTimeSeconds: { video: "soon" } }, path: "maxTimeSeconds.video" },
  ];

  it.each(cases)("reports $name with its dotted path", ({ override, path, mentions }) => {
    writeOverride(override);
    const problems = problemsOf(loadSettings({ defaultsPath, overridePath }));
    expect(problems).toHaveLength(1);
    expect(problems[0]!.startsWith(`${path}: `)).toBe(true);
    if (mentions) expect(problems[0]).toContain(mentions);
  });

  it("accepts a voice speed inside the range ElevenLabs accepts", () => {
    writeOverride({ voice: { speed: 1.1 } });
    const result = loadSettings({ defaultsPath, overridePath });
    expect(result.ok && result.settings.voice.speed).toBe(1.1);
  });

  it("lists every problem when several settings are wrong at once", () => {
    writeOverride({ languages: [], maxTimeSeconds: { image: -1 }, videoProvidr: { name: "RunningHub" } });
    const problems = problemsOf(loadSettings({ defaultsPath, overridePath }));
    expect(problems).toHaveLength(3);
    expect(problems.some((problem) => problem.startsWith("languages: "))).toBe(true);
    expect(problems.some((problem) => problem.startsWith("maxTimeSeconds.image: "))).toBe(true);
    expect(problems.some((problem) => problem.startsWith("videoProvidr: "))).toBe(true);
  });
});

describe("The reference image model (JOS-202)", () => {
  it("treats a missing key as a problem", () => {
    const defaults = validSettings();
    delete defaults.imageReferenceModel;
    writeFileSync(defaultsPath, JSON.stringify(defaults));
    const problems = problemsOf(loadSettings({ defaultsPath, overridePath }));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^imageReferenceModel: /);
  });

  it("rejects a URL, which could send the key to another host", () => {
    writeOverride({ imageReferenceModel: "https://evil.example/model" });
    const problems = problemsOf(loadSettings({ defaultsPath, overridePath }));
    expect(problems[0]).toMatch(/^imageReferenceModel: /);
  });

  it("accepts another model identifier in an override", () => {
    writeOverride({ imageReferenceModel: "fal-ai/bytedance/seedream/v4/edit" });
    const result = loadSettings({ defaultsPath, overridePath });
    expect(result.ok && result.settings.imageReferenceModel).toBe("fal-ai/bytedance/seedream/v4/edit");
  });
});

describe("Maximum times (spec stage-execution-time-limit)", () => {
  it("treats a missing key as a problem, not as 'not timed'", () => {
    const defaults = validSettings();
    delete (defaults.maxTimeSeconds as Json).image;
    writeFileSync(defaultsPath, JSON.stringify(defaults));
    const problems = problemsOf(loadSettings({ defaultsPath, overridePath }));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^maxTimeSeconds\.image: /);
  });

  it("accepts null as 'not timed'", () => {
    writeOverride({ maxTimeSeconds: { image: null } });
    const result = loadSettings({ defaultsPath, overridePath });
    expect(result.ok && result.settings.maxTimeSeconds.image).toBeNull();
  });
});

describe("The shipped defaults file (task 2.3)", () => {
  const shippedDefaultsPath = join(import.meta.dirname, "../config/settings.default.json");

  it("loads with no problems when there is no override", () => {
    const result = loadSettings({ defaultsPath: shippedDefaultsPath, overridePath: join(dir, "no-override.json") });
    expect(result.ok).toBe(true);
  });

  // The expected values are written out here on purpose, from PRD §11.3, not read from
  // `providers.ts`: that module derives from this file, so comparing to it would prove nothing.
  it("holds exactly the values PRD section 11.3 records today", () => {
    const result = loadSettings({ defaultsPath: shippedDefaultsPath, overridePath: join(dir, "no-override.json") });
    expect(result).toEqual({
      ok: true,
      settings: {
        decomposition: { name: "OpenAI", model: "gpt-6-astra" },
        voice: {
          name: "ElevenLabs",
          model: "eleven_multilingual_v2",
          voiceId: "4YYIPFl9wE5c4L2eu2Gb",
          voiceName: "Burt Reynolds™",
          outputFormat: "mp3_44100_128",
          speed: "default",
        },
        alignment: { name: "ElevenLabs", endpoint: "/v1/forced-alignment" },
        image: { name: "Fal.ai", model: "fal-ai/flux/dev" },
        imageReferenceModel: "fal-ai/flux-2/edit",
        video: {
          name: "RunningHub",
          endpoint: "/openapi/v2/minimax/hailuo-h3/image-to-video",
          admittedDurationSeconds: { min: 5, max: 15 },
        },
        segmentation: { lowerBoundSeconds: 5 },
        speedFactorLimit: 2,
        maxTimeSeconds: { decomposition: 600, image: 120, voice: 600, alignment: 5, video: 1200, assembly: null },
        maxSimultaneousRequests: { decomposition: 50, image: 200, voice: 3, alignment: 2, video: 3 },
        output: { width: 1920, height: 1080, fps: 30 },
        languages: [
          { code: "en", label: "English" },
          { code: "es", label: "Español" },
        ],
      },
    });
  });
});

describe("Credentials never come from settings files (spec)", () => {
  it("rejects a credential-like key, names it, and prints its value nowhere", () => {
    const secret = "sk-test-secret-value-1234567890";
    writeOverride({ openaiApiKey: secret });
    const result = loadSettings({ defaultsPath, overridePath });
    const problems = problemsOf(result);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^openaiApiKey: /);
    expect(JSON.stringify(result)).not.toContain(secret);
  });

  it("rejects an unknown key nested in a section, with the section in its path", () => {
    const secret = "sk-nested-secret-value";
    writeOverride({ decomposition: { apiKey: secret } });
    const result = loadSettings({ defaultsPath, overridePath });
    const problems = problemsOf(result);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^decomposition\.apiKey: /);
    expect(JSON.stringify(result)).not.toContain(secret);
  });

  it("never echoes a rejected value of a known setting", () => {
    const bad = "not-a-provider-zzz";
    writeOverride({ voice: { name: bad, speed: bad } });
    const result = loadSettings({ defaultsPath, overridePath });
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain(bad);
  });
});
