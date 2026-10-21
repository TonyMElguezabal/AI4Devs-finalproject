import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { activeProviderId, setActiveProvider } from "../src/activeProvider.ts";
import type { AlignmentProvider } from "../src/alignmentProvider.ts";
import { bindDecompositionProvider, createRun, db, getRun, getStageAttempts, insertVoiceOver, resetAll, writeArtefactOnce } from "../src/db.ts";
import { resetAlignmentProviderRegistry, resetReasoningProviderRegistry, setAlignmentProviderRegistry, setReasoningProviderRegistry } from "../src/decompositionDependencies.ts";
import { obtainNarrationTimestamps } from "../src/narrationTimestampsPhase.ts";
import { resetVoiceProviderRegistry, setVoiceProviderRegistry } from "../src/voiceProvider.ts";

// change-active-provider-from-admin (JOS-171), group 4 — guarantees that cut across the five bind points.

beforeEach(() => resetAll());
afterEach(() => {
  resetAlignmentProviderRegistry();
  resetReasoningProviderRegistry();
  resetVoiceProviderRegistry();
});

const SCRIPT = "Hi there. Bye now.";
const STEP = 0.1;

describe("native timestamps bind no alignment provider", () => {
  it("leaves the session's alignment binding empty when the voice provider's timestamps are usable", async () => {
    const runId = randomUUID();
    const { projectFolder } = createRun(runId, "Native test", SCRIPT, "en");
    writeArtefactOnce(projectFolder, "voice-over.mp3", Buffer.from([0x49, 0x44, 0x33, 0x04, 0, 0, 1, 2, 3]));
    const characters = [...SCRIPT];
    writeArtefactOnce(
      projectFolder,
      "voice-over.timestamps.json",
      JSON.stringify({
        audio_base64: "ignored",
        alignment: {
          characters,
          character_start_times_seconds: characters.map((_, i) => i * STEP),
          character_end_times_seconds: characters.map((_, i) => (i + 1) * STEP),
        },
      }),
    );
    insertVoiceOver({
      runId,
      audioPath: "voice-over.mp3",
      timestampsPath: "voice-over.timestamps.json",
      durationSeconds: SCRIPT.length * STEP,
      sizeBytes: 9,
      nativeTimestampsAvailable: true,
      providerRequestId: "req-1",
      completedAt: "2026-09-28T10:00:00.000Z",
    });
    const align = { calls: 0 };
    const provider: AlignmentProvider = { align: async () => ((align.calls += 1), { kind: "failed_not_retryable", reason: "must not be called" }) };
    setAlignmentProviderRegistry({ defaultIdentifier: "stub-a", adapters: { "stub-a": provider } });

    const result = await obtainNarrationTimestamps(runId, provider);

    expect(result).toEqual({ ok: true, mechanism: "native" });
    expect(align.calls).toBe(0);
    expect(getRun(runId)!.alignmentProviderId).toBeNull();
    expect(getStageAttempts(runId, "timestamps").map((attempt) => attempt.providerId)).toEqual(["elevenlabs-native"]);
  });
});

describe("a change never rebinds", () => {
  it("two first attempts across a change both use the single stored binding", () => {
    setReasoningProviderRegistry({ defaultIdentifier: "stub-a", adapters: { "stub-a": {}, "stub-b": {} } as never });
    const runId = randomUUID();
    createRun(runId, "Race test", SCRIPT, "en");

    expect(bindDecompositionProvider(runId, activeProviderId("reasoning"))).toBe(true); // the first attempt binds to stub-a
    setActiveProvider("reasoning", "stub-b"); // the Administrator changes it before the second first-attempt binds
    expect(bindDecompositionProvider(runId, activeProviderId("reasoning"))).toBe(false);

    expect(getRun(runId)!.decompositionProviderId).toBe("stub-a");
  });
});

describe("the active provider is read from the database on every call", () => {
  it("sees a choice written outside the process cache, as it would after a restart", () => {
    setVoiceProviderRegistry({ defaultIdentifier: "stub-a", adapters: { "stub-a": {}, "stub-b": {} } as never });
    expect(activeProviderId("voice")).toBe("stub-a");
    db.prepare("INSERT INTO active_providers (stage, provider_id, changed_at) VALUES ('voice', 'stub-b', '2026-10-21T00:00:00.000Z')").run();
    expect(activeProviderId("voice")).toBe("stub-b");
  });
});
