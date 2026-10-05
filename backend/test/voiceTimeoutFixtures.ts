import { randomUUID } from "node:crypto";
import { createRun, getStageAttempts } from "../src/db.ts";
import { PER_PHASE_MAX_TIME_SECONDS } from "../src/config/providers.ts";
import { generateVoiceOver } from "../src/voiceOverPhase.ts";
import { releaseAttempt } from "../src/retry/retryScheduler.ts";
import { createSilentMp3, setVoiceProviderRegistry, type VoiceProvider, type VoiceSynthesisResult } from "../src/voiceProvider.ts";
import { expect } from "vitest";

// stage-execution-time-limit (JOS-185) — shared setup for the timeout and late-result tests. Time is
// injected: nothing waits for real time.

export const SCRIPT = "The sun rose slowly over the quiet hills. Birds began to sing.";
export const VOICE_LIMIT_MS = PER_PHASE_MAX_TIME_SECONDS.voice * 1000;
// A day ahead of the real clock: the scheduler arms a real timer for each scheduled retry, and a retry due in the real past would be sent at once.
export const T0 = new Date(Date.now() + 86_400_000);
export const after = (ms: number): Date => new Date(T0.getTime() + ms);

export function register(): string {
  const runId = randomUUID();
  createRun(runId, "Timeout test", SCRIPT, "en");
  return runId;
}

export async function waitFor(condition: () => boolean, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("timed out waiting for the condition");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

export function successAnswer(): VoiceSynthesisResult {
  return { kind: "success", audio: createSilentMp3(1), providerRequestId: "stub-request-late" };
}

/** A voice provider whose n-th call stays pending until the test answers it, in any order. */
export function createGatedVoiceProvider(): VoiceProvider & {
  calls: number;
  answer: (call: number, result?: VoiceSynthesisResult) => void;
  /** Makes the n-th call throw, as a network failure would. */
  reject: (call: number) => void;
} {
  const gates: Array<{ resolve: (result: VoiceSynthesisResult) => void; reject: (error: Error) => void }> = [];
  const gate = (call: number) => {
    const found = gates[call - 1];
    if (!found) throw new Error(`call ${call} has not been made`);
    return found;
  };
  const provider = {
    calls: 0,
    answer: (call: number, result: VoiceSynthesisResult = successAnswer()) => gate(call).resolve(result),
    reject: (call: number) => gate(call).reject(new Error("stub: connection reset")),
    synthesize() {
      provider.calls++;
      return new Promise<VoiceSynthesisResult>((resolve, reject) => gates.push({ resolve, reject }));
    },
  };
  return provider;
}

export function useProvider(provider: VoiceProvider): void {
  setVoiceProviderRegistry({ defaultIdentifier: "stub-voice", adapters: { "stub-voice": provider } });
}

/** Starts the first attempt at T0 against a provider that answers only when told to. */
export async function sendFirstAttempt(runId: string) {
  const provider = createGatedVoiceProvider();
  useProvider(provider);
  const pending = generateVoiceOver(runId, () => T0);
  await waitFor(() => getStageAttempts(runId, "voice-over").some((attempt) => attempt.outcome === "in-flight"));
  return { provider, pending };
}

/** Claims the scheduled retry as if its due time had come, with the clock at `at`. */
export function sendScheduledRetry(runId: string, at: Date): void {
  const scheduled = getStageAttempts(runId, "voice-over").find((attempt) => attempt.outcome === "scheduled");
  if (!scheduled) throw new Error("no retry is scheduled");
  expect(releaseAttempt(scheduled.id, () => at)).toBe("sent");
}
