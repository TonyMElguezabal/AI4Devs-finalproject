// manage-providers-from-admin (JOS-218), design Decision 2 — the adapter types this build ships, per stage. Group 2
// only needs their identifiers and the stage list; the parameter schemas, field descriptors and factories join
// them in group 4.

export const PROVIDER_STAGES = ["reasoning", "voice", "alignment", "image", "video"] as const;
export type ProviderStage = (typeof PROVIDER_STAGES)[number];

/** The one adapter type each stage ships today, and the id the first profile of that stage keeps (Decision 1). */
export const SEEDED_PROFILES: Record<ProviderStage, { adapterType: string; id: string }> = {
  reasoning: { adapterType: "openai-reasoning", id: "openai-decomposition" },
  voice: { adapterType: "elevenlabs-voice", id: "ElevenLabs" },
  alignment: { adapterType: "elevenlabs-alignment", id: "elevenlabs-forced-alignment" },
  image: { adapterType: "fal-image", id: "Fal.ai" },
  video: { adapterType: "runninghub-video", id: "RunningHub" },
};
