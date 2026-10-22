import type { ProviderRegistry } from "./activeProvider.ts";
import { createElevenLabsAlignmentProvider } from "./alignmentProvider.ts";
import type { AlignmentProvider } from "./alignmentProvider.ts";
import type { DecompositionDependencies } from "./decompositionPhase.ts";
import { keyFor } from "./keyStore.ts";
import { buildProfileRegistry } from "./profileRegistry.ts";
import { ensureProfiles, getProfile } from "./providerProfiles.ts";
import { createOpenAiVisualInstructionGenerator } from "./visualInstructions.ts";
import type { VisualInstructionGenerator } from "./visualInstructions.ts";

/** The ids the two stages record on their attempts and, since JOS-171, bind to a session. Unchanged from before. */
export const REASONING_PROVIDER_ID = "openai-decomposition";
export const ALIGNMENT_PROVIDER_ID = "elevenlabs-forced-alignment";

// retry-decomposition (JOS-156), design Decision 4 — the two providers the
// decomposition steps need, held where a retry's attempt sender can reach them,
// the way `voiceProvider.ts` holds the voice registry. Tests install stubs.

/** The current parameters of a profile (JOS-218): read on every call, so an edit applies to the next request. */
function parametersOf<Parameters>(profileId: string): Parameters | undefined {
  ensureProfiles();
  return getProfile(profileId)?.parameters as Parameters | undefined;
}

function reasoningFor(profileId: string): VisualInstructionGenerator {
  return createOpenAiVisualInstructionGenerator({ parameters: parametersOf<{ model: string }>(profileId), loadKey: () => keyFor(profileId) });
}

function alignmentFor(profileId: string): AlignmentProvider {
  return createElevenLabsAlignmentProvider({ parameters: parametersOf<{ endpoint: string }>(profileId), loadKey: () => keyFor(profileId) });
}

function defaultDependencies(): DecompositionDependencies {
  // The default instances stand for the profiles created from the settings and follow their edits.
  return {
    alignmentProvider: { align: (audio, script) => alignmentFor(ALIGNMENT_PROVIDER_ID).align(audio, script) },
    instructionGenerator: { generate: (texts, language) => reasoningFor(REASONING_PROVIDER_ID).generate(texts, language) },
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
  reasoningOverride = undefined;
  alignmentOverride = undefined;
}

// change-active-provider-from-admin (JOS-171), design Decision 1 — reasoning and alignment get registries like
// voice, image and video. Unless a test installs its own, each registry is derived from the dependencies above,
// so `setDecompositionDependencies` keeps standing in for the stage's one shipped adapter.
let reasoningOverride: ProviderRegistry<VisualInstructionGenerator> | undefined;
let alignmentOverride: ProviderRegistry<AlignmentProvider> | undefined;

export function getReasoningProviderRegistry(): ProviderRegistry<VisualInstructionGenerator> {
  return (
    reasoningOverride ??
    buildProfileRegistry("reasoning", (profile) => (profile.id === REASONING_PROVIDER_ID ? dependencies.instructionGenerator : reasoningFor(profile.id)))
  );
}

export function setReasoningProviderRegistry(next: ProviderRegistry<VisualInstructionGenerator>): void {
  reasoningOverride = next;
}

export function resetReasoningProviderRegistry(): void {
  reasoningOverride = undefined;
}

export function getAlignmentProviderRegistry(): ProviderRegistry<AlignmentProvider> {
  return (
    alignmentOverride ??
    buildProfileRegistry("alignment", (profile) => (profile.id === ALIGNMENT_PROVIDER_ID ? dependencies.alignmentProvider : alignmentFor(profile.id)))
  );
}

export function setAlignmentProviderRegistry(next: ProviderRegistry<AlignmentProvider>): void {
  alignmentOverride = next;
}

export function resetAlignmentProviderRegistry(): void {
  alignmentOverride = undefined;
}
