import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assemblyStubModeFor } from "../src/server.ts";
import { createStubAssemblyTool, type StubAssemblyMode } from "../src/stubAssemblyTool.ts";

let scratch: string;
beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "vid4you-stub-assembly-"));
});
afterEach(() => {
  rmSync(scratch, { recursive: true, force: true });
});

const inputFor = (outputPath: string) => ({ clips: [], voiceOverPath: "", outputPath, fps: 25, width: 1920, height: 1080 });

// ignore-repeated-success-confirmations (JOS-161), task 5.1 — the manual-testing stub that keeps an assembly running long
// enough to pause and continue during it. Its unit test proves the delay is real and the result is still a success.

describe("slow-success assembly stub (manual endpoint testing)", () => {
  it("answers success only after its delay has passed", async () => {
    const tool = createStubAssemblyTool({ kind: "slow-success", delayMs: 60 });
    const startedAt = Date.now();

    const outputPath = join(scratch, "final.mp4");
    const result = await tool.assemble(inputFor(outputPath));

    expect(result).toEqual({ kind: "success", outputPath });
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(55);
  });
});

// verify-internal-workflow (JOS-243), design D4 — a succeeding stub leaves a file at the output path, so the final-video
// download serves one; a failing stub leaves none.
describe("the stub assembly tool's output file", () => {
  const succeeding: StubAssemblyMode[] = [{ kind: "success" }, { kind: "slow-success", delayMs: 1 }];
  for (const mode of succeeding) {
    it(`writes a non-empty file, creating its folder, in ${mode.kind} mode`, async () => {
      const outputPath = join(scratch, "missing-folder", "final.mp4");

      await createStubAssemblyTool(mode).assemble(inputFor(outputPath));

      expect(statSync(outputPath).size).toBeGreaterThan(0);
    });
  }

  it("keeps a file that is already at the output path", async () => {
    const outputPath = join(scratch, "final.mp4");
    writeFileSync(outputPath, "real bytes");

    await createStubAssemblyTool({ kind: "success" }).assemble(inputFor(outputPath));

    expect(readFileSync(outputPath, "utf8")).toBe("real bytes");
  });

  const failing: StubAssemblyMode[] = [{ kind: "transient-failure" }, { kind: "not-retryable-failure" }];
  for (const mode of failing) {
    it(`writes nothing in ${mode.kind} mode`, async () => {
      const outputPath = join(scratch, "final.mp4");

      await createStubAssemblyTool(mode).assemble(inputFor(outputPath));

      expect(existsSync(outputPath)).toBe(false);
    });
  }
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
