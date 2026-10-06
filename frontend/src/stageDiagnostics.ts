import type { DiagnosticStage, StageDiagnostic } from "./types";

// see-provider-and-attempts (JOS-166), design Decision 6 — the one place a stage diagnostic is turned into text,
// so a scene's details and a phase's section cannot word it differently.

export const STAGE_DIAGNOSTIC_LABEL: Record<DiagnosticStage, string> = {
  image: "Image",
  video: "Clip",
  "voice-over": "Voice-over",
  timestamps: "Timestamps",
  instructions: "Scene instructions",
  assembly: "Assembly",
};

/** `Fal.ai (fal-ai/flux/dev), 2 attempts`; a provider with no model is shown by name alone. */
export function describeStageDiagnostic(diagnostic: StageDiagnostic): string {
  const { name, model } = diagnostic.provider;
  const provider = model ? `${name} (${model})` : name;
  return `${provider}, ${diagnostic.attempts} ${diagnostic.attempts === 1 ? "attempt" : "attempts"}`;
}

/** `Image: Fal.ai (fal-ai/flux/dev), 2 attempts`. */
export function formatStageDiagnostic(diagnostic: StageDiagnostic): string {
  return `${STAGE_DIAGNOSTIC_LABEL[diagnostic.stage]}: ${describeStageDiagnostic(diagnostic)}`;
}
