import { describe, expect, it } from "vitest";
import { createStubAlignmentProvider, createStubInstructionGenerator } from "../src/decompositionStubs.ts";

// verify-internal-workflow (JOS-243), design D3 — the succeeding decomposition stubs that `USE_STUB_DECOMPOSITION` and the
// packaged `--smoke` flavor share. The stub narration is about 1 s long, so the timestamps must end inside it.

describe("the stub instruction generator", () => {
  it("answers one image and one video instruction per text", async () => {
    const result = await createStubInstructionGenerator().generate(["first", "second"], "en");

    expect(result).toEqual({
      kind: "success",
      pairs: [
        { image: "image 1", video: "video 1" },
        { image: "image 2", video: "video 2" },
      ],
    });
  });
});

describe("the stub alignment provider", () => {
  it("answers one ordered timestamp per script character, the last ending within the stub narration", async () => {
    const script = "Hello, world";

    const result = await createStubAlignmentProvider().align(new Uint8Array(), script);

    if (result.kind !== "success") throw new Error(`expected success, got ${result.kind}`);
    expect(result.characters.map((character) => character.text).join("")).toBe(script);
    for (const [i, character] of result.characters.entries()) {
      expect(character.end).toBeGreaterThan(character.start);
      if (i > 0) expect(character.start).toBeCloseTo(result.characters[i - 1]!.end);
    }
    expect(result.characters.at(-1)!.end).toBeLessThanOrEqual(0.96);
  });

  it("answers an empty script with no characters", async () => {
    expect(await createStubAlignmentProvider().align(new Uint8Array(), "")).toEqual({ kind: "success", characters: [] });
  });
});
