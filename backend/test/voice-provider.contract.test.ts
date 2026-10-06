import { describe, expect, it } from "vitest";
import { VOICE_PROVIDER } from "../src/config/providers.ts";
import { createElevenLabsVoiceProvider, type VoiceSynthesisRequest } from "../src/voiceProvider.ts";

// generate-voice-over (JOS-136) task 4.5 — opt-in contract test against the
// REAL ElevenLabs text-to-speech endpoint. It spends account credits and needs
// ELEVENLABS_KEY, so it is skipped unless enabled:
//
//   RUN_PROVIDER_CONTRACT_TESTS=1 npx vitest run test/voice-provider.contract.test.ts
//
// One success (a short script) and one known rejection (a voice id the account
// cannot use, answered with a 4xx).

const enabled = process.env.RUN_PROVIDER_CONTRACT_TESTS === "1";

const request: VoiceSynthesisRequest = {
  text: "The sun rose slowly over the quiet hills.",
  language: "en",
  voiceId: VOICE_PROVIDER.voiceId,
  model: VOICE_PROVIDER.model,
  outputFormat: VOICE_PROVIDER.outputFormat,
  speed: VOICE_PROVIDER.speed,
};

describe.skipIf(!enabled)("The real ElevenLabs endpoint narrates a script", () => {
  it(
    "returns audio, character timestamps and a request id for a valid request",
    async () => {
      const started = Date.now();
      const result = await createElevenLabsVoiceProvider().synthesize(request);
      console.log(`voice synthesis answered in ${Date.now() - started} ms`);

      expect(result.kind).toBe("success");
      if (result.kind !== "success") return;
      expect(result.audio.byteLength).toBeGreaterThan(0);
      expect(result.nativeTimestamps).toBeDefined();
      expect(result.providerRequestId).toBeDefined();
    },
    60_000,
  );

  it(
    "rejects an unknown voice as not retryable",
    async () => {
      const result = await createElevenLabsVoiceProvider().synthesize({ ...request, voiceId: "not-a-real-voice-id" });

      expect(result.kind).toBe("failed_not_retryable");
    },
    60_000,
  );
});
