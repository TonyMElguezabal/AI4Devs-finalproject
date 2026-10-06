import { beforeEach, describe, expect, it } from "vitest";
import { DECOMPOSITION_PROVIDER, IMAGE_PROVIDER, VIDEO_PROVIDER, VOICE_PROVIDER } from "../src/config/providers.ts";
import { DECOMPOSITION_ATTEMPT_PROVIDER } from "../src/decompositionPhase.ts";
import { STUB_VIDEO_PROVIDER_NAME } from "../src/videoProvider.ts";
import { STUB_PROVIDER_NAME } from "../src/types.ts";
import { describeProvider, diagnosticStageOf, resetDiagnosticsLog, setDiagnosticsLogger } from "../src/stageDiagnostics.ts";

// see-provider-and-attempts (JOS-166), design Decision 2 — what a stored provider identifier is shown as.
// Nothing here may echo a stored identifier that has no entry.

const logged: string[] = [];

beforeEach(() => {
  logged.length = 0;
  resetDiagnosticsLog();
  setDiagnosticsLogger((message) => logged.push(message));
});

describe("describeProvider shows a readable provider for each stage", () => {
  it("image: Fal.ai with its model", () => {
    expect(describeProvider("image", IMAGE_PROVIDER.model)).toEqual({ name: "Fal.ai", model: "fal-ai/flux/dev" });
  });

  it("clip: RunningHub, with a model label and never the endpoint path", () => {
    const shown = describeProvider("video", VIDEO_PROVIDER.endpoint);

    expect(shown).toEqual({ name: "RunningHub", model: "minimax/hailuo-h3" });
    expect(JSON.stringify(shown)).not.toContain(VIDEO_PROVIDER.endpoint);
  });

  it("voice-over: ElevenLabs with its model", () => {
    expect(describeProvider("voice-over", VOICE_PROVIDER.name)).toEqual({ name: "ElevenLabs", model: VOICE_PROVIDER.model });
  });

  it("timestamps: the mechanism in use, native or forced alignment", () => {
    expect(describeProvider("timestamps", "elevenlabs-native")).toEqual({ name: "ElevenLabs", model: "native timestamps" });
    expect(describeProvider("timestamps", "elevenlabs-forced-alignment")).toEqual({ name: "ElevenLabs", model: "forced alignment" });
  });

  it("instructions: the reasoning provider and model", () => {
    expect(describeProvider("instructions", DECOMPOSITION_ATTEMPT_PROVIDER)).toEqual({ name: DECOMPOSITION_PROVIDER.name, model: DECOMPOSITION_PROVIDER.model });
  });

  it("assembly: local assembly, with no external provider", () => {
    expect(describeProvider("assembly", null)).toEqual({ name: "Local assembly", model: "ffmpeg" });
  });

  it("the stubs: Stub provider, with the identifier as the model", () => {
    expect(describeProvider("image", STUB_PROVIDER_NAME)).toEqual({ name: "Stub provider", model: STUB_PROVIDER_NAME });
    expect(describeProvider("video", STUB_VIDEO_PROVIDER_NAME)).toEqual({ name: "Stub provider", model: STUB_VIDEO_PROVIDER_NAME });
    expect(describeProvider("voice-over", "stub-voice")).toEqual({ name: "Stub provider", model: "stub-voice" });
  });
});

describe("an identifier with no entry", () => {
  it("is shown as an unknown provider with no model, and the stored value is never returned", () => {
    const shown = describeProvider("image", "internal-secret-endpoint-v7");

    expect(shown).toEqual({ name: "Unknown provider", model: null });
    expect(JSON.stringify(shown)).not.toContain("internal-secret-endpoint-v7");
  });

  it("is logged once per identifier, without the repeated calls flooding the log", () => {
    describeProvider("image", "mystery-1");
    describeProvider("image", "mystery-1");
    describeProvider("video", "mystery-2");

    expect(logged).toHaveLength(2);
  });

  it("a known identifier of another stage is not borrowed (an image identifier is unknown to the clip stage)", () => {
    expect(describeProvider("video", IMAGE_PROVIDER.model).name).toBe("Unknown provider");
  });

  it("a missing identifier is unknown for every stage but assembly", () => {
    expect(describeProvider("image", null).name).toBe("Unknown provider");
    expect(describeProvider("assembly", null).name).toBe("Local assembly");
  });
});

describe("every identifier the code can bind or record has an entry", () => {
  const known: Array<["image" | "video" | "voice-over" | "timestamps" | "instructions" | "assembly", string | null]> = [
    ["image", IMAGE_PROVIDER.model],
    ["image", STUB_PROVIDER_NAME],
    ["video", VIDEO_PROVIDER.endpoint],
    ["video", STUB_VIDEO_PROVIDER_NAME],
    ["voice-over", VOICE_PROVIDER.name],
    ["voice-over", "stub-voice"],
    ["timestamps", "elevenlabs-native"],
    ["timestamps", "elevenlabs-forced-alignment"],
    ["instructions", DECOMPOSITION_ATTEMPT_PROVIDER],
    ["assembly", null],
  ];

  it.each(known)("%s: %s", (stage, identifier) => {
    expect(describeProvider(stage, identifier).name).not.toBe("Unknown provider");
    expect(logged).toEqual([]);
  });
});

describe("the stored attempt stage and the wire stage", () => {
  it("names the decomposition's reasoning call `instructions` and keeps every other stage's name", () => {
    expect(diagnosticStageOf("decomposition")).toBe("instructions");
    expect(diagnosticStageOf("timestamps")).toBe("timestamps");
    expect(diagnosticStageOf("voice-over")).toBe("voice-over");
    expect(diagnosticStageOf("assembly")).toBe("assembly");
    expect(diagnosticStageOf("image")).toBe("image");
    expect(diagnosticStageOf("video")).toBe("video");
  });
});
