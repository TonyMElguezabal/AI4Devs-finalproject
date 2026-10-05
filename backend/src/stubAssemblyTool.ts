// assemble-final-video (JOS-149) — test stubs for AssemblyTool.
// Replaces the real ffmpeg adapter in unit and integration tests; modes map
// to the three result kinds the phase's retry policy must handle.

import type { AssemblyInput, AssemblyResult, AssemblyTool } from "./assemblyTool.ts";

export type StubAssemblyMode =
  | { kind: "success" }
  | { kind: "transient-failure"; reason?: string }
  | { kind: "not-retryable-failure"; reason?: string };

export function createStubAssemblyTool(mode: StubAssemblyMode = { kind: "success" }): AssemblyTool {
  return {
    async assemble(input: AssemblyInput): Promise<AssemblyResult> {
      switch (mode.kind) {
        case "success":
          return { kind: "success", outputPath: input.outputPath };
        case "transient-failure":
          return { kind: "failed_transient", reason: mode.reason ?? "stub transient failure" };
        case "not-retryable-failure":
          return { kind: "failed_not_retryable", reason: mode.reason ?? "stub not-retryable failure" };
      }
    },
  };
}

/** A snapshot of an AssemblyInput received by the capturing stub. */
export type CapturedAssemblyInput = AssemblyInput;

/** Stub that records every AssemblyInput it receives (for test assertions on what the phase builds). */
export function createCapturingAssemblyTool(captures: CapturedAssemblyInput[]): AssemblyTool {
  return {
    async assemble(input: AssemblyInput): Promise<AssemblyResult> {
      captures.push({ ...input, clips: [...input.clips] });
      return { kind: "success", outputPath: input.outputPath };
    },
  };
}
