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
beforeEach(async () => {
  // follow-fal-image-queue (JOS-239): an image request is checked every 5 s in production; tests check it every millisecond.
  // Imported here, not at the top: a static import would load the orchestrator before a test file's `vi.mock` of the
  // provider constants takes effect.
  const { setImagePollIntervalMs } = await import("../src/orchestrator.ts");
  setImagePollIntervalMs(1);
  setScriptModerator({ moderate: async () => ({ kind: "clean" }) });
  resetScheduler();
  resetRetryDelayConfig();
  setVoiceProviderRegistry({
    defaultIdentifier: "stub-voice",
    adapters: { "stub-voice": createStubVoiceProvider("hang") },
  });
});
