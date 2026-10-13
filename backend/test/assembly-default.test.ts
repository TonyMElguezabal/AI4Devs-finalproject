import { afterEach, describe, expect, it, vi } from "vitest";
import type { AssemblyTool } from "../src/assemblyTool.ts";
import { getAssemblyTool, resetAssemblyTool } from "../src/orchestrator.ts";
import { configureAssemblyTool } from "../src/server.ts";
import type { StubAssemblyMode } from "../src/stubAssemblyTool.ts";

// run-session-end-to-end (JOS-195), design Decision 5 — the running application registers the real ffmpeg assembly
// tool unless a stub mode is configured, so a session reaching assembly never fails with "no assembly tool is configured".

afterEach(() => {
  resetAssemblyTool();
});

const toolNamed = (name: string): AssemblyTool => ({ assemble: async () => ({ kind: "failed_not_retryable", reason: name }) });

function factories() {
  const ffmpegTool = toolNamed("ffmpeg");
  const stubTool = toolNamed("stub");
  return {
    ffmpegTool,
    stubTool,
    ffmpeg: vi.fn(() => ffmpegTool),
    stub: vi.fn((_mode: StubAssemblyMode) => stubTool),
  };
}

describe("configureAssemblyTool", () => {
  it("registers the ffmpeg tool when no stub mode is set", () => {
    const f = factories();

    const registered = configureAssemblyTool({}, { ffmpeg: f.ffmpeg, stub: f.stub });

    expect(registered).toBe(f.ffmpegTool);
    expect(getAssemblyTool()).toBe(f.ffmpegTool);
    expect(f.stub).not.toHaveBeenCalled();
  });

  it("registers the stub in the requested mode when USE_STUB_ASSEMBLY_TOOL is set", () => {
    const f = factories();

    const registered = configureAssemblyTool({ USE_STUB_ASSEMBLY_TOOL: "success" }, { ffmpeg: f.ffmpeg, stub: f.stub });

    expect(registered).toBe(f.stubTool);
    expect(getAssemblyTool()).toBe(f.stubTool);
    expect(f.stub).toHaveBeenCalledWith({ kind: "success" });
    expect(f.ffmpeg).not.toHaveBeenCalled();
  });

  it.each([
    ["not-retryable-failure", undefined, { kind: "not-retryable-failure" }],
    ["slow-success", "250", { kind: "slow-success", delayMs: 250 }],
    ["anything-else", undefined, { kind: "transient-failure" }],
  ] as const)("maps USE_STUB_ASSEMBLY_TOOL=%s to its stub mode", (name, delay, expected) => {
    const f = factories();

    configureAssemblyTool({ USE_STUB_ASSEMBLY_TOOL: name, ASSEMBLY_STUB_DELAY_MS: delay }, { ffmpeg: f.ffmpeg, stub: f.stub });

    expect(f.stub).toHaveBeenCalledWith(expected);
  });

  it("registers the real ffmpeg adapter by default, with no factories given", () => {
    const registered = configureAssemblyTool({});

    expect(getAssemblyTool()).toBe(registered);
    expect(typeof registered.assemble).toBe("function");
  });
});
