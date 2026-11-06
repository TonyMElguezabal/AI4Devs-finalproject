import {
  DECOMPOSITION_PROVIDER,
  IMAGE_PROVIDER,
  LEGACY_IMAGE_PROVIDER_IDENTIFIER,
  LEGACY_VIDEO_PROVIDER_IDENTIFIER,
  VIDEO_PROVIDER,
  VOICE_PROVIDER,
} from "./config/providers.ts";
import { resolveProfileId } from "./keyStore.ts";
import { voiceProviderIdOfNative } from "./nativeTimestampsProvider.ts";
import { ensureProfiles, getProfile } from "./providerProfiles.ts";
import type { ProviderStage } from "./providerTypes.ts";
import type { AttemptStage } from "./types.ts";

// see-provider-and-attempts (JOS-166), design Decisions 2 and 4 — what the page may show about a stage:
// a readable provider (name and model) and an attempt count. Nothing else of an attempt record leaves
// the backend: no credential, endpoint path, request id, raw error code or message.

/** The stage names the representation uses. The decomposition's reasoning call is `instructions` here. */
export type DiagnosticStage = "image" | "video" | "voice-over" | "timestamps" | "instructions" | "assembly";

export interface ProviderDisplay {
  name: string;
  model: string | null;
}

/** The whole of what a stage reports. The response schemas are strict on exactly these fields. */
export interface StageDiagnostic {
  stage: DiagnosticStage;
  provider: ProviderDisplay;
  attempts: number;
}

const UNKNOWN: ProviderDisplay = { name: "Unknown provider", model: null };
const stub = (identifier: string): ProviderDisplay => ({ name: "Stub provider", model: identifier });

// Keyed by the identifier each stage stores: the registry identifier of the bound provider, or the
// `provider_id` its attempts record. Identifiers that no stage stores have no entry on purpose.
const DISPLAY: Record<DiagnosticStage, ReadonlyMap<string | null, ProviderDisplay>> = {
  image: new Map([
    [IMAGE_PROVIDER.name, { name: IMAGE_PROVIDER.name, model: IMAGE_PROVIDER.model }],
    [LEGACY_IMAGE_PROVIDER_IDENTIFIER, { name: IMAGE_PROVIDER.name, model: IMAGE_PROVIDER.model }],
  ]),
  // The endpoint path is configuration detail the User does not need, so the model is a fixed label.
  video: new Map([
    [VIDEO_PROVIDER.name, { name: VIDEO_PROVIDER.name, model: "minimax/hailuo-h3" }],
    [LEGACY_VIDEO_PROVIDER_IDENTIFIER, { name: VIDEO_PROVIDER.name, model: "minimax/hailuo-h3" }],
  ]),
  "voice-over": new Map([
    [VOICE_PROVIDER.name, { name: VOICE_PROVIDER.name, model: VOICE_PROVIDER.model }],
  ]),
  // The ids timestamps attempts were recorded with before JOS-264; a native attempt now names its voice provider.
  timestamps: new Map([
    ["elevenlabs-native", { name: "ElevenLabs", model: "native timestamps" }],
    ["elevenlabs-forced-alignment", { name: "ElevenLabs", model: "forced alignment" }],
  ]),
  // `DECOMPOSITION_ATTEMPT_PROVIDER` in `decompositionPhase.ts`; the test pins the two together.
  instructions: new Map([["openai-decomposition", { name: DECOMPOSITION_PROVIDER.name, model: DECOMPOSITION_PROVIDER.model }]]),
  assembly: new Map([[null, { name: "Local assembly", model: "ffmpeg" }]]),
};

let log: (message: string) => void = () => {};
const alreadyLogged = new Set<string>();

export function setDiagnosticsLogger(next: (message: string) => void): void {
  log = next;
}

/** Test hook: forget which unknown identifiers were already logged. */
export function resetDiagnosticsLog(): void {
  alreadyLogged.clear();
}

const PROFILE_STAGE: Record<Exclude<DiagnosticStage, "assembly">, ProviderStage> = {
  image: "image",
  video: "video",
  "voice-over": "voice",
  timestamps: "alignment",
  instructions: "reasoning",
};

/**
 * manage-providers-from-admin (JOS-218), design Decision 8 — a provider is shown by its profile: the display name and,
 * where the User needs one, the model. The video endpoint path stays out of sight; the first profile keeps its label.
 */
function describeProfile(stage: DiagnosticStage, identifier: string | null): ProviderDisplay | undefined {
  if (identifier === null || stage === "assembly") return undefined;
  if (stage === "timestamps" && identifier === "elevenlabs-native") return undefined;
  ensureProfiles();
  const profileStage = PROFILE_STAGE[stage];
  const profile = getProfile(resolveProfileId(profileStage, identifier));
  if (!profile || profile.stage !== profileStage) return undefined;
  switch (stage) {
    case "timestamps":
      return { name: profile.label, model: "forced alignment" };
    case "video":
      // configurable-video-connector (JOS-219): a connector names its model; the seeded RunningHub profile's endpoint does.
      return { name: profile.label, model: typeof profile.parameters.model === "string" ? profile.parameters.model : profile.id === "RunningHub" ? "minimax/hailuo-h3" : null };
    default: {
      const model = profile.parameters.model;
      return { name: profile.label, model: typeof model === "string" ? model : null };
    }
  }
}

/**
 * The provider to show for a stage's stored identifier. An identifier with no entry is shown as an
 * unknown provider and logged once; the stored value is never returned, because it may be an internal
 * id, an endpoint or something a configuration change left behind.
 */
export function describeProvider(stage: DiagnosticStage, identifier: string | null): ProviderDisplay {
  // attribute-native-timestamps-to-voice-provider (JOS-264) — native timestamps are shown as the voice provider that made them.
  const nativeVoice = stage === "timestamps" && !DISPLAY.timestamps.has(identifier) ? voiceProviderIdOfNative(identifier) : null;
  if (nativeVoice !== null) return { ...describeProvider("voice-over", nativeVoice), model: "native timestamps" };
  // verify-internal-workflow (JOS-243) — every stub identifier starts with `stub-`, as `telemetryProviderOf` (db.ts) assumes.
  const found = describeProfile(stage, identifier) ?? DISPLAY[stage].get(identifier) ?? (identifier?.startsWith("stub-") ? stub(identifier) : undefined);
  if (found) return { ...found };
  const key = `${stage}:${identifier}`;
  if (!alreadyLogged.has(key)) {
    alreadyLogged.add(key);
    log(`no display entry for the ${stage} provider identifier '${identifier}'`);
  }
  return { ...UNKNOWN };
}

/** The decomposition stage stores its attempts as `decomposition`; the page calls that stage `instructions`. */
export function diagnosticStageOf(stage: AttemptStage): DiagnosticStage {
  return stage === "decomposition" ? "instructions" : stage;
}
