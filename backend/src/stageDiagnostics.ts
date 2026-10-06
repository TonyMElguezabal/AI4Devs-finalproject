import { DECOMPOSITION_PROVIDER, IMAGE_PROVIDER, VIDEO_PROVIDER, VOICE_PROVIDER } from "./config/providers.ts";
import { STUB_PROVIDER_NAME, type AttemptStage } from "./types.ts";
import { STUB_VIDEO_PROVIDER_NAME } from "./videoProvider.ts";

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
    [IMAGE_PROVIDER.model, { name: IMAGE_PROVIDER.name, model: IMAGE_PROVIDER.model }],
    [STUB_PROVIDER_NAME, stub(STUB_PROVIDER_NAME)],
  ]),
  // The endpoint path is configuration detail the User does not need, so the model is a fixed label.
  video: new Map([
    [VIDEO_PROVIDER.endpoint, { name: VIDEO_PROVIDER.name, model: "minimax/hailuo-h3" }],
    [STUB_VIDEO_PROVIDER_NAME, stub(STUB_VIDEO_PROVIDER_NAME)],
  ]),
  "voice-over": new Map([
    [VOICE_PROVIDER.name, { name: VOICE_PROVIDER.name, model: VOICE_PROVIDER.model }],
    ["stub-voice", stub("stub-voice")],
  ]),
  // `narrationTimestampsPhase.ts` records these two as the provider of each timestamps attempt.
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

/**
 * The provider to show for a stage's stored identifier. An identifier with no entry is shown as an
 * unknown provider and logged once; the stored value is never returned, because it may be an internal
 * id, an endpoint or something a configuration change left behind.
 */
export function describeProvider(stage: DiagnosticStage, identifier: string | null): ProviderDisplay {
  const found = DISPLAY[stage].get(identifier);
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
