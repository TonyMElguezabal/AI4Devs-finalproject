import { beforeEach } from "vitest";
import { resetRetryDelayConfig } from "../src/retry/stageAttemptRecorder.ts";
import { resetScheduler } from "../src/retry/retryScheduler.ts";
import { createStubVoiceProvider, setVoiceProviderRegistry } from "../src/voiceProvider.ts";

// generate-voice-over (JOS-136): registering a session now launches voice
// generation on its own, so every test that registers one would reach the real
// provider with whatever key is in the local secrets file. Each test starts
// with a stub that never answers; a test that needs another outcome installs
// its own registry.
beforeEach(() => {
  resetScheduler();
  resetRetryDelayConfig();
  setVoiceProviderRegistry({
    defaultIdentifier: "stub-voice",
    adapters: { "stub-voice": createStubVoiceProvider("hang") },
  });
});
