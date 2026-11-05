// assemble-final-video (JOS-149) — test stubs for AssemblyTool.
// Replaces the real ffmpeg adapter in unit and integration tests; modes map
// to the three result kinds the phase's retry policy must handle.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { AssemblyInput, AssemblyResult, AssemblyTool } from "./assemblyTool.ts";

export type StubAssemblyMode =
  | { kind: "success" }
  | { kind: "transient-failure"; reason?: string }
  | { kind: "not-retryable-failure"; reason?: string }
  /** Manual endpoint testing only (JOS-161, task 5.1): succeeds after `delayMs`, so an assembly can be paused during it. */
  | { kind: "slow-success"; delayMs: number };

// verify-internal-workflow (JOS-243), design D4 — a succeeding stub leaves a placeholder at the output path, so the
// final-video download serves a file. It is not a playable MP4. A file already there is kept: some tests write real
// bytes and then call this stub.
function writePlaceholder(outputPath: string): AssemblyResult {
  if (!existsSync(outputPath)) {
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, "stub final video");
  }
  return { kind: "success", outputPath };
}

export function createStubAssemblyTool(mode: StubAssemblyMode = { kind: "success" }): AssemblyTool {
  return {
    async assemble(input: AssemblyInput): Promise<AssemblyResult> {
      switch (mode.kind) {
        case "success":
          return writePlaceholder(input.outputPath);
        case "transient-failure":
          return { kind: "failed_transient", reason: mode.reason ?? "stub transient failure" };
        case "not-retryable-failure":
          return { kind: "failed_not_retryable", reason: mode.reason ?? "stub not-retryable failure" };
        case "slow-success":
          await new Promise((resolve) => setTimeout(resolve, mode.delayMs));
          return writePlaceholder(input.outputPath);
      }
    },
  };
}

/** A snapshot of an AssemblyInput received by the capturing stub. */
export type CapturedAssemblyInput = AssemblyInput;

/** Stub that records every AssemblyInput it receives (for test assertions on what the phase builds). */
export function createCapturingAssemblyTool(captures: CapturedAssemblyInput[]): AssemblyTool {
  return {
    // eslint-disable-next-line @typescript-eslint/require-await -- implements the async AssemblyTool contract
    async assemble(input: AssemblyInput): Promise<AssemblyResult> {
      captures.push({ ...input, clips: [...input.clips], ...(input.narrationEdits ? { narrationEdits: [...input.narrationEdits] } : {}) });
      return { kind: "success", outputPath: input.outputPath };
    },
  };
}
