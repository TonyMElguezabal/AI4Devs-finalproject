import { afterEach, describe, expect, it } from "vitest";
import { getDecompositionDependencies } from "../src/decompositionDependencies.ts";
import {
  installStubDecompositionDependencies,
  removeStubDecompositionDependencies,
} from "./decompositionStubs.ts";

// run-session-end-to-end (JOS-195), design Decision 6 — the shared helper that keeps every test that narrates a
// session away from the real OpenAI and ElevenLabs alignment providers, now that a stored narration starts decomposition.

afterEach(() => {
  removeStubDecompositionDependencies();
});

describe("the stub decomposition dependencies helper", () => {
  it("answers alignment with one timed character per script character and counts the call", async () => {
    const stubs = installStubDecompositionDependencies();
    const { alignmentProvider } = getDecompositionDependencies();

    const result = await alignmentProvider.align(new Uint8Array([1, 2, 3]), "Hi there.");

    expect(result.kind).toBe("success");
    if (result.kind !== "success") throw new Error("unreachable");
    expect(result.characters.map((character) => character.text).join("")).toBe("Hi there.");
    expect(result.characters[0]!.start).toBeLessThan(result.characters[0]!.end);
    expect(stubs.alignCalls).toBe(1);
  });

  it("answers visual instructions with one image and one video instruction per text and counts the call", async () => {
    const stubs = installStubDecompositionDependencies();
    const { instructionGenerator } = getDecompositionDependencies();

    const result = await instructionGenerator.generate(["first", "second"]);

    expect(result).toEqual({
      kind: "success",
      pairs: [
        { image: "image 1", video: "video 1" },
        { image: "image 2", video: "video 2" },
      ],
    });
    expect(stubs.generateCalls).toBe(1);
  });

  it("restores the real providers when removed", () => {
    installStubDecompositionDependencies();
    const stubbed = getDecompositionDependencies();

    removeStubDecompositionDependencies();
    const restored = getDecompositionDependencies();

    expect(restored).not.toBe(stubbed);
    expect(restored.alignmentProvider).not.toBe(stubbed.alignmentProvider);
    expect(restored.instructionGenerator).not.toBe(stubbed.instructionGenerator);
  });

  it("starts counting from zero on every install", async () => {
    const first = installStubDecompositionDependencies();
    await getDecompositionDependencies().instructionGenerator.generate(["a"]);
    expect(first.generateCalls).toBe(1);

    const second = installStubDecompositionDependencies();
    expect(second.generateCalls).toBe(0);
    expect(second.alignCalls).toBe(0);
  });
});
