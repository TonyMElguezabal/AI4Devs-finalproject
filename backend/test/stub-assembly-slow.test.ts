import { describe, expect, it } from "vitest";
import { assemblyStubModeFor } from "../src/server.ts";
import { createStubAssemblyTool } from "../src/stubAssemblyTool.ts";

// ignore-repeated-success-confirmations (JOS-161), task 5.1 — the manual-testing stub that keeps an assembly running long
// enough to pause and continue during it. Its unit test proves the delay is real and the result is still a success.

describe("slow-success assembly stub (manual endpoint testing)", () => {
  it("answers success only after its delay has passed", async () => {
    const tool = createStubAssemblyTool({ kind: "slow-success", delayMs: 60 });
    const startedAt = Date.now();

    const result = await tool.assemble({ clips: [], voiceOverPath: "", outputPath: "/tmp/final.mp4", fps: 25, width: 1920, height: 1080 } as never);

    expect(result).toEqual({ kind: "success", outputPath: "/tmp/final.mp4" });
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(55);
  });
});

describe("USE_STUB_ASSEMBLY_TOOL mapping (manual endpoint testing)", () => {
  it("maps each named mode, reading the slow delay from its variable and defaulting it to 15 seconds", () => {
    expect(assemblyStubModeFor("success", undefined)).toEqual({ kind: "success" });
    expect(assemblyStubModeFor("not-retryable-failure", undefined)).toEqual({ kind: "not-retryable-failure" });
    expect(assemblyStubModeFor("slow-success", "250")).toEqual({ kind: "slow-success", delayMs: 250 });
    expect(assemblyStubModeFor("slow-success", undefined)).toEqual({ kind: "slow-success", delayMs: 15000 });
  });

  it("falls back to a transient failure for an unknown name", () => {
    expect(assemblyStubModeFor("anything-else", undefined)).toEqual({ kind: "transient-failure" });
  });
});
