import { PER_PHASE_MAX_TIME_SECONDS } from "../src/config/providers.ts";

// configure-providers-and-parameters (JOS-174): a stage's maximum time can now be "not timed", so the
// constant is `number | "undetermined"`. These tests run against the shipped defaults, where every
// stage except assembly is timed; this returns the number and fails loudly if that stops being true.
export function limitSeconds(stage: keyof typeof PER_PHASE_MAX_TIME_SECONDS): number {
  const seconds = PER_PHASE_MAX_TIME_SECONDS[stage];
  if (seconds === "undetermined") throw new Error(`the ${stage} stage has no maximum time in the settings these tests run against`);
  return seconds;
}
