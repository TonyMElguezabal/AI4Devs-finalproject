import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { SETTINGS } from "../src/config/providers.ts";
import { createRun, resetAll } from "../src/db.ts";
import { insertProfile, seedProviderProfiles, updateProfile } from "../src/providerProfiles.ts";
import { describeProvider } from "../src/stageDiagnostics.ts";
import { generateVoiceOver } from "../src/voiceOverPhase.ts";
import { createSilentMp3, setVoiceProviderRegistry, type VoiceSynthesisRequest } from "../src/voiceProvider.ts";

// manage-providers-from-admin (JOS-218), group 4 — design Decisions 3, 4 and 8: what a request carries comes from the
// bound profile's current parameters, and diagnostics name a provider by its profile.

const LATER = "2099-01-01T00:00:00.000Z";

beforeEach(() => {
  resetAll();
  seedProviderProfiles(SETTINGS);
});

describe("diagnostics name a provider by its profile", () => {
  it("shows the label and the model of an image profile added on /admin", () => {
    insertProfile({ id: "01IMG", stage: "image", adapterType: "fal-image", label: "Flux pro", parameters: { model: "fal-ai/flux-pro" } }, LATER);
    expect(describeProvider("image", "01IMG")).toEqual({ name: "Flux pro", model: "fal-ai/flux-pro" });
  });

  it("shows a video profile by its label without its endpoint path", () => {
    insertProfile({ id: "01VID", stage: "video", adapterType: "runninghub-video", label: "Other video", parameters: { endpoint: "/x", admittedDurationSeconds: { min: 5, max: 10 } } }, LATER);
    expect(describeProvider("video", "01VID")).toEqual({ name: "Other video", model: null });
  });

  it("shows voice, reasoning and alignment profiles by label", () => {
    insertProfile({ id: "01VOI", stage: "voice", adapterType: "elevenlabs-voice", label: "Other voice", parameters: { model: "v-model", voiceId: "v", voiceName: "n", outputFormat: "mp3_44100_128", speed: "default" } }, LATER);
    insertProfile({ id: "01REA", stage: "reasoning", adapterType: "openai-reasoning", label: "Other model", parameters: { model: "gpt-other" } }, LATER);
    insertProfile({ id: "01ALI", stage: "alignment", adapterType: "elevenlabs-alignment", label: "Other alignment", parameters: { endpoint: "/v1/x" } }, LATER);
    expect(describeProvider("voice-over", "01VOI")).toEqual({ name: "Other voice", model: "v-model" });
    expect(describeProvider("instructions", "01REA")).toEqual({ name: "Other model", model: "gpt-other" });
    expect(describeProvider("timestamps", "01ALI")).toEqual({ name: "Other alignment", model: "forced alignment" });
  });

  it("follows an edited label and model, and still shows the shipped providers as before", () => {
    updateProfile("Fal.ai", { label: "Fal.ai", parameters: { model: "fal-ai/flux/pro" } }, LATER);
    expect(describeProvider("image", "Fal.ai")).toEqual({ name: "Fal.ai", model: "fal-ai/flux/pro" });
    expect(describeProvider("image", "fal-ai/flux/dev")).toEqual({ name: "Fal.ai", model: "fal-ai/flux/pro" });
  });
});

describe("the voice request carries the bound profile's current parameters", () => {
  it("sends the edited voice and speed to the provider the session is bound to", async () => {
    const requests: VoiceSynthesisRequest[] = [];
    setVoiceProviderRegistry({
      defaultIdentifier: "ElevenLabs",
      adapters: {
        ElevenLabs: {
          synthesize: async (request) => {
            requests.push(request);
            return { kind: "success", audio: createSilentMp3(1) };
          },
        },
      },
    });
    const { name: _name, ...voice } = SETTINGS.voice;
    updateProfile("ElevenLabs", { label: "ElevenLabs", parameters: { ...voice, voiceId: "edited-voice", speed: 1.1 } }, LATER);
    const runId = randomUUID();
    createRun(runId, "Voice parameters", "A short script.", "en");

    await generateVoiceOver(runId);

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ voiceId: "edited-voice", speed: 1.1, model: SETTINGS.voice.model, outputFormat: SETTINGS.voice.outputFormat });
  });

  it("falls back to the settings for a provider with no profile (a test stub)", async () => {
    const requests: VoiceSynthesisRequest[] = [];
    setVoiceProviderRegistry({
      defaultIdentifier: "stub-a",
      adapters: { "stub-a": { synthesize: async (request) => (requests.push(request), { kind: "success", audio: createSilentMp3(1) }) } },
    });
    const runId = randomUUID();
    createRun(runId, "Voice fallback", "A short script.", "en");
    await generateVoiceOver(runId);
    expect(requests[0]).toMatchObject({ voiceId: SETTINGS.voice.voiceId });
  });
});
