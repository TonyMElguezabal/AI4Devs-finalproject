import type { AlignmentProvider } from "./alignmentProvider.ts";
import type { VisualInstructionGenerator } from "./visualInstructions.ts";

// verify-internal-workflow (JOS-243), design D3 — the succeeding decomposition stubs, shared by `USE_STUB_DECOMPOSITION`
// and the packaged `--smoke` flavor (moved from `packaging/smokeStubs.ts`). Manual and workflow testing only.

/** Answers one image and one video instruction per text. */
export function createStubInstructionGenerator(): VisualInstructionGenerator {
  return {
    generate(texts) {
      return Promise.resolve({ kind: "success", pairs: texts.map((_, i) => ({ image: `image ${i + 1}`, video: `video ${i + 1}` })) });
    },
  };
}

/**
 * The stub narration is about 1 s long; the script's characters are spread over 0.95 s so the product's own timestamp
 * validation (the last character must end within the narration) accepts them.
 */
export function createStubAlignmentProvider(): AlignmentProvider {
  return {
    align(_audio, script) {
      const step = 0.95 / Math.max([...script].length, 1);
      return Promise.resolve({ kind: "success", characters: [...script].map((text, i) => ({ text, start: 0.01 + i * step, end: 0.01 + (i + 1) * step })) });
    },
  };
}
