import type { AlignmentProvider } from "../src/alignmentProvider.ts";
import { resetDecompositionDependencies, setDecompositionDependencies } from "../src/decompositionDependencies.ts";
import type { VisualInstructionGenerator } from "../src/visualInstructions.ts";

// run-session-end-to-end (JOS-195), design Decision 6 — a stored narration now starts decomposition, whose default
// providers are the real ElevenLabs alignment and OpenAI visual instructions. A test that narrates a session installs
// these instead, so it never reaches a real provider and needs no credentials.

const STEP_SECONDS = 0.25;

export interface StubDecompositionCalls {
  alignCalls: number;
  generateCalls: number;
}

/** Installs succeeding alignment and visual-instruction stubs; the returned counters start at zero. */
export function installStubDecompositionDependencies(): StubDecompositionCalls {
  const calls: StubDecompositionCalls = { alignCalls: 0, generateCalls: 0 };
  const alignmentProvider: AlignmentProvider = {
    async align(_audio, script) {
      calls.alignCalls += 1;
      return {
        kind: "success",
        characters: [...script].map((text, i) => ({ text, start: 0.1 + i * STEP_SECONDS, end: 0.1 + (i + 1) * STEP_SECONDS })),
      };
    },
  };
  const instructionGenerator: VisualInstructionGenerator = {
    async generate(texts) {
      calls.generateCalls += 1;
      return { kind: "success", pairs: texts.map((_, i) => ({ image: `image ${i + 1}`, video: `video ${i + 1}` })) };
    },
  };
  setDecompositionDependencies({ alignmentProvider, instructionGenerator });
  return calls;
}

/** Puts the real providers back (test teardown). */
export function removeStubDecompositionDependencies(): void {
  resetDecompositionDependencies();
}
