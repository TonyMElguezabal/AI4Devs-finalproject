import { createElevenLabsAlignmentProvider } from "./alignmentProvider.ts";
import type { DecompositionDependencies } from "./decompositionPhase.ts";
import { createOpenAiVisualInstructionGenerator } from "./visualInstructions.ts";

// retry-decomposition (JOS-156), design Decision 4 — the two providers the
// decomposition steps need, held where a retry's attempt sender can reach them,
// the way `voiceProvider.ts` holds the voice registry. Tests install stubs.

function defaultDependencies(): DecompositionDependencies {
  return {
    alignmentProvider: createElevenLabsAlignmentProvider(),
    instructionGenerator: createOpenAiVisualInstructionGenerator(),
  };
}

let dependencies: DecompositionDependencies = defaultDependencies();

export function getDecompositionDependencies(): DecompositionDependencies {
  return dependencies;
}

export function setDecompositionDependencies(next: DecompositionDependencies): void {
  dependencies = next;
}

export function resetDecompositionDependencies(): void {
  dependencies = defaultDependencies();
}
