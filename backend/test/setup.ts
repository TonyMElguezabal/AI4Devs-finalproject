import { beforeEach } from "vitest";
import { resetRetryDelayConfig } from "../src/retry/stageAttemptRecorder.ts";
import { resetScheduler } from "../src/retry/retryScheduler.ts";
import { setScriptModerator } from "../src/scriptModeration.ts";
import { createStubVoiceProvider, setVoiceProviderRegistry } from "../src/voiceProvider.ts";

// generate-voice-over (JOS-136): registering a session now launches voice
// generation on its own, so every test that registers one would reach the real
// provider with whatever key is in the local secrets file. Each test starts
// with a stub that never answers; a test that needs another outcome installs
// its own registry.
//
// moderate-script-at-submission (JOS-187): the same holds for the content
// check, so each test starts with a moderator that finds every script clean.
beforeEach(() => {
  setScriptModerator({ moderate: async () => ({ kind: "clean" }) });
  resetScheduler();
  resetRetryDelayConfig();
  setVoiceProviderRegistry({
    defaultIdentifier: "stub-voice",
    adapters: { "stub-voice": createStubVoiceProvider("hang") },
  });
});
