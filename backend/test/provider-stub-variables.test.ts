import { afterEach, describe, expect, it } from "vitest";
import {
  getAlignmentProviderRegistry,
  getReasoningProviderRegistry,
  resetAlignmentProviderRegistry,
  resetReasoningProviderRegistry,
} from "../src/decompositionDependencies.ts";
import { getScriptModerator, resetScriptModerator } from "../src/scriptModeration.ts";
import { configureProviderStubs } from "../src/server.ts";

// verify-internal-workflow (JOS-243), design D1 and D2 — `USE_STUB_DECOMPOSITION` and `USE_STUB_SCRIPT_MODERATION`
// replace the reasoning, alignment and moderation providers at boot, so a session runs with no OpenAI or ElevenLabs call.

afterEach(() => {
  resetReasoningProviderRegistry();
  resetAlignmentProviderRegistry();
  resetScriptModerator();
});

describe("USE_STUB_DECOMPOSITION", () => {
  it("installs the stub reasoning and alignment providers under stub- identifiers with success", async () => {
    expect(configureProviderStubs({ USE_STUB_DECOMPOSITION: "success" })).toEqual([]);

    const reasoning = getReasoningProviderRegistry();
    const alignment = getAlignmentProviderRegistry();
    expect(reasoning.defaultIdentifier).toBe("stub-reasoning");
    expect(Object.keys(reasoning.adapters)).toEqual(["stub-reasoning"]);
    expect(alignment.defaultIdentifier).toBe("stub-alignment");
    expect(Object.keys(alignment.adapters)).toEqual(["stub-alignment"]);
    expect(await reasoning.adapters["stub-reasoning"]!.generate(["a text"], "en")).toEqual({ kind: "success", pairs: [{ image: "image 1", video: "video 1" }] });
    expect((await alignment.adapters["stub-alignment"]!.align(new Uint8Array(), "ab")).kind).toBe("success");
  });

  for (const value of [undefined, ""]) {
    it(`keeps the registries built from the profiles when it is ${JSON.stringify(value)}`, () => {
      const reasoningBefore = getReasoningProviderRegistry().defaultIdentifier;
      const alignmentBefore = getAlignmentProviderRegistry().defaultIdentifier;

      expect(configureProviderStubs({ USE_STUB_DECOMPOSITION: value })).toEqual([]);

      expect(getReasoningProviderRegistry().defaultIdentifier).toBe(reasoningBefore);
      expect(getAlignmentProviderRegistry().defaultIdentifier).toBe(alignmentBefore);
      expect(reasoningBefore.startsWith("stub-")).toBe(false);
    });
  }

  it("keeps the real providers and warns for an unknown mode", () => {
    const reasoningBefore = getReasoningProviderRegistry().defaultIdentifier;

    const warnings = configureProviderStubs({ USE_STUB_DECOMPOSITION: "sucess" });

    expect(getReasoningProviderRegistry().defaultIdentifier).toBe(reasoningBefore);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("USE_STUB_DECOMPOSITION");
  });
});

describe("USE_STUB_SCRIPT_MODERATION", () => {
  it("accepts every script with clean", async () => {
    configureProviderStubs({ USE_STUB_SCRIPT_MODERATION: "clean" });

    expect(await getScriptModerator().moderate("any script at all")).toEqual({ kind: "clean" });
  });

  it("keeps the real moderator when unset, and warns for an unknown mode", () => {
    const before = getScriptModerator();

    expect(configureProviderStubs({})).toEqual([]);
    expect(getScriptModerator()).toBe(before);

    const warnings = configureProviderStubs({ USE_STUB_SCRIPT_MODERATION: "yes" });
    expect(getScriptModerator()).toBe(before);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("USE_STUB_SCRIPT_MODERATION");
  });
});
