/**
 * define-provider-configuration (JOS-165) — the one constants module holding
 * every hardcoded provider and parameter value PRD §11 defers to this spike
 * (backend-standards.md, "Constants"). A typed module compiled into the
 * application, not a configuration file or runtime configuration (Decision 8,
 * §2.3). Every value below traces to a real measurement recorded under
 * `openspec/changes/define-provider-configuration/reports/`; nothing here is
 * invented — an item left `undetermined` says so explicitly rather than
 * carrying a guessed number (Decision 6).
 *
 * This module holds no credential (task 10.3) — credentials load separately
 * via `loadCredential` (./credentials.ts).
 */

// ---- Providers and version identifiers per stage (task 10.2) ----
// Stage identifiers follow the PRD's own names (backend-standards.md), not
// the capability-descriptive labels this spike's own tasks.md uses
// ("reasoning" below is PRD's "decomposition" stage).

export const DECOMPOSITION_PROVIDER = {
  name: "OpenAI",
  model: "gpt-6-astra",
} as const;

export const VOICE_PROVIDER = {
  name: "ElevenLabs",
  model: "eleven_multilingual_v2",
  voiceId: "4YYIPFl9wE5c4L2eu2Gb",
  voiceName: "Burt Reynolds™",
  /** No separate "quality" tier beyond model + output encoding (report: step 4). */
  outputFormat: "mp3_44100_128",
  /** Not overridden — provider default (report: step 4). */
  speed: "default" as const,
} as const;

export const ALIGNMENT_PROVIDER = {
  name: "ElevenLabs",
  endpoint: "/v1/forced-alignment",
  /** Same account as VOICE_PROVIDER — task 7.5a: derive any shared cap jointly, not independently. */
  sharesAccountWith: "voice" as const,
} as const;

export const IMAGE_PROVIDER = {
  name: "Fal.ai",
  model: "fal-ai/flux/dev",
} as const;

export const VIDEO_PROVIDER = {
  name: "RunningHub",
  /**
   * RunningHub versions by endpoint path, not a separate version field
   * (report: step 3, task 3.4). A path retirement fails calls outright with
   * no fallback (§11.2) — review RunningHub's model catalog periodically for
   * a deprecation notice on this path.
   */
  endpoint: "/openapi/v2/minimax/hailuo-h3/image-to-video",
} as const;

// ---- Supported languages (§4.1, D09) — replaces the placeholder in ./languages.ts ----
// Verified per language across all three chain stages (voice, alignment,
// decomposition), not adopted from an advertised list (Decision 4; report: step 6).

export const SUPPORTED_LANGUAGE_CODES = ["en", "es"] as const;
export type SupportedLanguageCode = (typeof SUPPORTED_LANGUAGE_CODES)[number];

export const SUPPORTED_LANGUAGES: ReadonlyArray<{ code: SupportedLanguageCode; label: string }> = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
];

/**
 * The decomposition prompt MUST include an explicit whitespace-preservation
 * instruction plus a self-check step for exact script reconstruction — the
 * plain fidelity instruction alone reproducibly dropped inter-sentence spaces
 * for Spanish (2/2 failures) despite working for English (report: step 6).
 * Use the refined prompt for BOTH languages, not only Spanish.
 */
export const DECOMPOSITION_REQUIRES_WHITESPACE_PRESERVATION_INSTRUCTION = true;

// ---- Video generation (§11, §6.1) ----

/**
 * Measured, not assumed (report: step 3). Both ends tested with real calls;
 * intermediate values and the out-of-range boundary were not individually
 * probed.
 */
export const VIDEO_ADMITTED_DURATION_SECONDS = { min: 5, max: 15 } as const;

/**
 * §6.1's segmentation lower bound, derived from VIDEO_ADMITTED_DURATION_SECONDS.min
 * (report: step 9, task 9.1). Kept as a separate named constant, not a
 * duplicate literal, so the two cannot drift apart (§6.1's own consistency
 * requirement).
 */
/**
 * The clip durations segmentation and clip requests treat as admitted: every
 * whole second from `min` to `max` (segment-script-into-chunks, JOS-140,
 * Decision 6; product owner decision 2026-09-28). PROVENANCE: 5 s and 15 s
 * were verified with real calls in JOS-165 (report: step 3); the whole seconds
 * in between come from the provider's documentation and are verified by
 * JOS-140's manual test (8 s and 11 s). If a value is rejected, this list
 * shrinks and the grouping's optimisation follows. Derived from the range
 * above so the two cannot drift apart; JOS-147 reuses it.
 */
export const VIDEO_ADMITTED_DURATIONS_SECONDS: readonly number[] = Array.from(
  { length: VIDEO_ADMITTED_DURATION_SECONDS.max - VIDEO_ADMITTED_DURATION_SECONDS.min + 1 },
  (_, offset) => VIDEO_ADMITTED_DURATION_SECONDS.min + offset,
);

export const SEGMENTATION_LOWER_BOUND_SECONDS = VIDEO_ADMITTED_DURATION_SECONDS.min;
export const SEGMENTATION_UPPER_BOUND_SECONDS = VIDEO_ADMITTED_DURATION_SECONDS.max;

/**
 * Generation setting, deliberately ABOVE the final FINAL_OUTPUT target
 * (below) in every dimension — RunningHub's `768P` tier (1344×768@24fps) and
 * `2K` tier (2560×1440@24fps) both miss D08's 1920×1080@30fps natively
 * (report: step 3). `2K` is used so assembly downscales rather than upscales.
 */
export const VIDEO_GENERATION_SETTING = { resolution: "2K", nativeWidth: 2560, nativeHeight: 1440, nativeFps: 24 } as const;

// ---- Image generation (§7.1) ----

/**
 * `fal-ai/flux/dev` rounds requested dimensions to multiples of 16 — an exact
 * 1920×1080 request silently returns 1920×1072, 8px short of §7.1's minimum
 * (report: step 5b). 1920×1088 is the smallest 16-aligned size that clears
 * it; aspect ratio is then 1.765:1, not exactly 16:9 (1.778:1).
 */
export const IMAGE_GENERATION_SIZE = { width: 1920, height: 1088 } as const;

// ---- Final assembled MP4 output (D08, §7.3) ----
// Neither provider above natively produces this — the assembly stage
// (define-media-assembly, JOS-182) MUST resize + convert frame rate for
// every video chunk (report: step 9, task 9.3). This is a confirmed
// requirement, not an assumption.

export const FINAL_OUTPUT = {
  width: 1920,
  height: 1080,
  fps: 30,
  videoCodec: "H.264",
  audioCodec: "AAC",
} as const;

// ---- Per-stage request caps (§10.1, Decision 6) ----
// Derived from a measured rate limit with headroom for the 1+3 retry budget.
// `undetermined` where no real limit was found — recording an invented
// number was explicitly rejected (Decision 6; report: step 7c).

export const MAX_SIMULTANEOUS_REQUESTS = {
  decomposition: 50, // 500 req/min (OpenAI, measured) ÷ 10 headroom factor — provisional pending group 8 latency data
  image: 200, // 2000 (Fal.ai, measured) ÷ 10 — provisional, the rate-limit window's time unit is unconfirmed
  voice: "undetermined" as const, // ElevenLabs: no request-rate number found; constraint is the shared character quota (see ALIGNMENT_PROVIDER.sharesAccountWith)
  alignment: "undetermined" as const, // shares ElevenLabs account with voice — task 7.5a
  video: "undetermined" as const, // RunningHub: no numeric limit found; empirical probing deferred by product owner (report: step 7c)
} as const;

// ---- Per-phase maximum times (§10.1, Decision 7) ----
// Provisional — 4-7 real samples per stage (report: step 8), enough to see
// rough spread, not a rigorous percentile study. Revisit if real-world
// timeout failure rates suggest these margins are wrong.

export const PER_PHASE_MAX_TIME_SECONDS = {
  decomposition: 20, // observed 6.41-8.47s
  image: 25, // observed 9.22-10.79s
  voice: 10, // observed 2.20-2.47s
  alignment: 5, // observed 0.26-0.48s
  video: 240, // observed 141.10-159.50s sequential, 156.12-157.61s at 3x concurrency
  assembly: "undetermined" as const, // define-media-assembly (JOS-182) not yet archived — report: step 8, task 8.5
} as const;

// ---- Speed-factor limit (§7.3, D11 dependency) ----
// PROVISIONAL — define-media-assembly (JOS-182)'s Decision 5 owns the real
// measurement; this change only records the number once that lands (task
// 1.3, task 9.4). Not yet available.
export const SPEED_FACTOR_LIMIT: number | "undetermined" = "undetermined";

// ---- Not-retryable failure signal (§10.1, Decision 5) ----
/**
 * MAJOR FINDING, not a value (report: steps 7a/7b) — recorded here as a
 * code-adjacent warning because it changes what §10.1's retry logic can rely
 * on. Tested with disallowed instructional content across all four
 * provider-calling stages: NONE produced a distinguishable not-retryable
 * failure signal. Decomposition (OpenAI) silently sanitizes only the
 * generated image/video instruction fields while preserving the narration
 * text verbatim (HTTP 200, ordinary success shape). Voice, image and video
 * all generated the requested content outright. Fal.ai's `has_nsfw_concepts`
 * field exists but is scoped to sexual content, not violence/weapons.
 * §10.1's not-retryable branch currently has nothing to trigger on for this
 * content class on any of these four providers — escalated to the product
 * owner, not resolved by this module.
 */
export const NOT_RETRYABLE_FAILURE_SIGNAL_CONFIRMED = false;
