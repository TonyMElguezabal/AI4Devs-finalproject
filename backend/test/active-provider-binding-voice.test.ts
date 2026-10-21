import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { setActiveProvider } from "../src/activeProvider.ts";
import { createRun, getRun, getStageAttempts, resetAll } from "../src/db.ts";
import { releaseAttempt } from "../src/retry/retryScheduler.ts";
import { generateVoiceOver } from "../src/voiceOverPhase.ts";
import { retryVoiceOver } from "../src/voiceOverRetry.ts";
import { createStubVoiceProvider, resetVoiceProviderRegistry, setVoiceProviderRegistry } from "../src/voiceProvider.ts";

// change-active-provider-from-admin (JOS-171), group 4 — the voice bind point (AC1, AC3, AC5).

const SCRIPT = "The lighthouse stands alone against the storm.";

beforeEach(() => {
  resetAll();
  resetVoiceProviderRegistry();
});

/** Releases the session's scheduled retry as if its delay had passed, and waits for the send to finish. */
async function sendScheduledRetry(runId: string): Promise<void> {
  const scheduled = getStageAttempts(runId, "voice-over").find((attempt) => attempt.outcome === "scheduled");
  if (!scheduled) throw new Error("no retry is scheduled");
  expect(releaseAttempt(scheduled.id, () => new Date(Date.now() + 3_600_000))).toBe("sent");
  while (getStageAttempts(runId, "voice-over").some((attempt) => attempt.outcome === "in-flight")) await new Promise((resolve) => setTimeout(resolve, 5));
}

function newRun(): string {
  const runId = randomUUID();
  createRun(runId, "Voice binding test", SCRIPT, "en");
  return runId;
}

describe("voice binding to the active provider", () => {
  it("AC1: the session binds to the provider active at its first attempt and sends it there", async () => {
    const stubA = createStubVoiceProvider("success");
    const stubB = createStubVoiceProvider("success");
    setVoiceProviderRegistry({ defaultIdentifier: "stub-a", adapters: { "stub-a": stubA, "stub-b": stubB } });
    setActiveProvider("voice", "stub-b");

    const runId = newRun();
    await generateVoiceOver(runId);

    expect(getRun(runId)!.voiceProviderId).toBe("stub-b");
    expect(stubB.calls).toHaveLength(1);
    expect(stubA.calls).toHaveLength(0);
  });

  it("AC3 and AC5: a bound session keeps its provider for a manual retry after the change, and nothing goes to the new one", async () => {
    const stubB = createStubVoiceProvider("success");
    setVoiceProviderRegistry({ defaultIdentifier: "stub-a", adapters: { "stub-a": createStubVoiceProvider("transient-failure"), "stub-b": stubB } });
    const runId = newRun();
    await generateVoiceOver(runId);
    for (let attempt = 2; attempt <= 4; attempt++) await sendScheduledRetry(runId); // retries exhausted: the cycle's 4th attempt failed
    expect(getRun(runId)!.voiceProviderId).toBe("stub-a");

    const stubA = createStubVoiceProvider("success");
    setVoiceProviderRegistry({ defaultIdentifier: "stub-a", adapters: { "stub-a": stubA, "stub-b": stubB } });
    setActiveProvider("voice", "stub-b");
    expect(retryVoiceOver(runId)).toEqual({ ok: true, held: false });
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(stubA.calls).toHaveLength(1);
    expect(stubB.calls).toHaveLength(0);
    expect(new Set(getStageAttempts(runId, "voice-over").map((attempt) => attempt.providerId))).toEqual(new Set(["stub-a"]));
  });
});
