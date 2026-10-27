import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db, resetAll } from "../src/db.ts";
import { insertProfile } from "../src/providerProfiles.ts";
import { providerUsageReport } from "../src/providerUsageReport.ts";
import { installTwoProvidersPerStage, registerScenes, removeTwoProvidersPerStage } from "./failedStageFixtures.ts";
import { PERIOD, bindScene, plusMs, requestedSecondsOf, seedAttempt, seedSceneAttempt, seedVoiceOver } from "./providerUsageFixtures.ts";

// report-provider-usage (JOS-223), task 2.3 — design Decisions 2–4: the numbers of the spike's R1 query, per stage and provider.

const AT = "2026-10-05T10:00:00.000Z";

beforeEach(() => {
  resetAll();
  installTwoProvidersPerStage();
});

afterEach(() => removeTwoProvidersPerStage());

const rowOf = (stage: string, providerId: string) => providerUsageReport(PERIOD).rows.find((row) => row.stage === stage && row.providerId === providerId);

function seedVoiceA(): void {
  seedAttempt({ stage: "voice-over", providerId: "voice-a", sentAt: AT, outcome: "success", latencyMs: 1000, scriptLength: 28 });
  seedAttempt({ stage: "voice-over", providerId: "voice-a", sentAt: AT, outcome: "late-success", latencyMs: 3000, scriptLength: 10 });
  seedAttempt({ stage: "voice-over", providerId: "voice-a", sentAt: AT, outcome: "transient", latencyMs: 500 });
  seedAttempt({ stage: "voice-over", providerId: "voice-a", sentAt: AT, outcome: "not-retryable", latencyMs: 200 });
  seedAttempt({ stage: "voice-over", providerId: "voice-a", sentAt: AT, outcome: "timed-out", latencyMs: 60000 });
}

describe("providerUsageReport", () => {
  it("counts attempts, outcomes, success rate, percentiles and billed characters of a voice provider", () => {
    seedVoiceA();
    expect(rowOf("voice", "voice-a")).toEqual({
      stage: "voice",
      providerId: "voice-a",
      providerLabel: "voice-a",
      attempts: 5,
      successes: 2,
      transient: 1,
      notRetryable: 1,
      timedOut: 1,
      successRatePercent: 40,
      medianLatencyMs: 1000,
      p95LatencyMs: 60000,
      billedUnits: 38,
      unit: "voice_characters",
    });
  });

  it("does not count scheduled, in-flight, superseded, cancelled or unsent attempts", () => {
    for (const outcome of ["scheduled", "in-flight", "superseded", "cancelled"] as const) seedAttempt({ stage: "voice-over", providerId: "voice-a", sentAt: AT, outcome });
    expect(providerUsageReport(PERIOD).rows).toEqual([]);
  });

  it("bills audio seconds for alignment and one request for reasoning, and ignores native timestamps", () => {
    const alignmentRun = seedAttempt({ stage: "timestamps", providerId: "align-a", sentAt: AT, outcome: "success", latencyMs: 2000 });
    seedVoiceOver(alignmentRun, 12.5);
    seedAttempt({ stage: "timestamps", providerId: "elevenlabs-native", sentAt: AT, outcome: "success" });
    seedAttempt({ stage: "decomposition", providerId: "llm-a", sentAt: AT, outcome: "success", latencyMs: 4000 });

    expect(rowOf("alignment", "align-a")).toMatchObject({ attempts: 1, successes: 1, billedUnits: 12.5, unit: "audio_seconds", medianLatencyMs: 2000 });
    expect(rowOf("alignment", "elevenlabs-native")).toBeUndefined();
    expect(rowOf("reasoning", "llm-a")).toMatchObject({ attempts: 1, billedUnits: 1, unit: "requests" });
  });

  it("counts image and clip attempts for the scene's provider and leaves out the stub-only modes", async () => {
    const { sceneIds } = await registerScenes([7, 8]);
    bindScene(sceneIds[0]!, { provider: "img-a", videoProvider: "vid-b" });
    bindScene(sceneIds[1]!, { provider: "img-a" });
    seedSceneAttempt({ sceneId: sceneIds[0]!, stage: "image", mode: "success", latencyMs: 100, sentAt: AT });
    seedSceneAttempt({ sceneId: sceneIds[0]!, stage: "image", mode: "transient_failure", latencyMs: 50, sentAt: AT });
    seedSceneAttempt({ sceneId: sceneIds[0]!, stage: "image", mode: "unrecoverable", latencyMs: 10, sentAt: AT });
    seedSceneAttempt({ sceneId: sceneIds[0]!, stage: "image", mode: "flaky", latencyMs: 10, sentAt: AT });
    seedSceneAttempt({ sceneId: sceneIds[1]!, stage: "image", mode: "success", latencyMs: 300, sentAt: AT });
    seedSceneAttempt({ sceneId: sceneIds[0]!, stage: "video", mode: "not_retryable_failure", latencyMs: 700, sentAt: AT });
    seedSceneAttempt({ sceneId: sceneIds[0]!, stage: "video", mode: "success", latencyMs: 8000, sentAt: AT });

    expect(rowOf("image", "img-a")).toMatchObject({ attempts: 3, successes: 2, transient: 1, medianLatencyMs: 100, p95LatencyMs: 300, billedUnits: 2, unit: "images" });
    expect(rowOf("video", "vid-b")).toMatchObject({ attempts: 2, successes: 1, notRetryable: 1, successRatePercent: 50, billedUnits: requestedSecondsOf(sceneIds[0]!), unit: "clip_seconds" });
  });

  it("counts every attempt of a scene moved to another provider for the current one only", async () => {
    const { sceneIds } = await registerScenes([7]);
    bindScene(sceneIds[0]!, { videoProvider: "vid-a" });
    seedSceneAttempt({ sceneId: sceneIds[0]!, stage: "video", mode: "transient_failure", latencyMs: 700, sentAt: AT });
    bindScene(sceneIds[0]!, { videoProvider: "vid-b" });
    seedSceneAttempt({ sceneId: sceneIds[0]!, stage: "video", mode: "success", latencyMs: 800, sentAt: AT });

    expect(rowOf("video", "vid-a")).toBeUndefined();
    expect(rowOf("video", "vid-b")).toMatchObject({ attempts: 2, successes: 1, transient: 1 });
  });

  it("counts failed attempts as billing nothing", () => {
    seedAttempt({ stage: "voice-over", providerId: "voice-a", sentAt: AT, outcome: "transient" });
    expect(rowOf("voice", "voice-a")).toMatchObject({ successes: 0, successRatePercent: 0, billedUnits: 0 });
  });

  it("leaves latency null when no attempt of the row has a finish time, and still counts the attempt", () => {
    seedAttempt({ stage: "voice-over", providerId: "voice-a", sentAt: AT, outcome: "success" });
    db.prepare("UPDATE stage_attempts SET finished_at = NULL").run();
    expect(rowOf("voice", "voice-a")).toMatchObject({ attempts: 1, medianLatencyMs: null, p95LatencyMs: null });
  });

  describe("period", () => {
    it("includes an attempt sent exactly at `from` and excludes one sent exactly at `to` or before `from`", () => {
      seedAttempt({ stage: "voice-over", providerId: "at-from", sentAt: PERIOD.from, outcome: "success" });
      seedAttempt({ stage: "voice-over", providerId: "at-to", sentAt: PERIOD.to, outcome: "success" });
      seedAttempt({ stage: "voice-over", providerId: "before", sentAt: plusMs(PERIOD.from, -1), outcome: "success" });
      expect(providerUsageReport(PERIOD).rows.map((row) => row.providerId)).toEqual(["at-from"]);
    });

    it("counts everything before `to` when `from` is absent", () => {
      seedAttempt({ stage: "voice-over", providerId: "before", sentAt: "2020-01-01T00:00:00.000Z", outcome: "success" });
      expect(providerUsageReport({ to: PERIOD.to }).rows.map((row) => row.providerId)).toEqual(["before"]);
      expect(providerUsageReport({ to: PERIOD.to }).from).toBeNull();
    });

    it("lists no row for a provider whose attempts are all outside the period, and none for an empty period", () => {
      seedAttempt({ stage: "voice-over", providerId: "voice-old", sentAt: "2026-09-01T00:00:00.000Z", outcome: "success" });
      expect(providerUsageReport(PERIOD)).toMatchObject({ from: PERIOD.from, to: PERIOD.to, rows: [] });
    });
  });

  describe("rows", () => {
    it("are in pipeline order, then by label, and the label falls back to the provider id", () => {
      insertProfile({ id: "voice-z", stage: "voice", adapterType: "stub", label: "Alpha Voice", parameters: {} }, PERIOD.from);
      for (const [stage, providerId] of [["decomposition", "llm-a"], ["voice-over", "voice-m"], ["voice-over", "voice-z"], ["timestamps", "align-a"]] as const) {
        seedAttempt({ stage, providerId, sentAt: AT, outcome: "success" });
      }
      expect(providerUsageReport(PERIOD).rows.map((row) => [row.stage, row.providerLabel])).toEqual([
        ["voice", "Alpha Voice"],
        ["voice", "voice-m"],
        ["alignment", "align-a"],
        ["reasoning", "llm-a"],
      ]);
    });

    it("say scene attempts follow the scene's current provider", () => {
      expect(providerUsageReport(PERIOD).sceneAttemptsFollowCurrentProvider).toBe(true);
    });
  });
});
