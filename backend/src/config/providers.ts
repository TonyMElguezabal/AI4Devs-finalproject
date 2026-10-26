/**
 * define-provider-configuration (JOS-165) — the one constants module holding
 * every provider and parameter value PRD §11 defers to this spike
 * (backend-standards.md, "Constants"). Every value below traces to a real
 * measurement recorded under
 * `openspec/changes/define-provider-configuration/reports/`; nothing here is
 * invented — an item left `undetermined` says so explicitly rather than
 * carrying a guessed number (Decision 6).
 *
 * configure-providers-and-parameters (JOS-174): the values PRD §11 lists as
 * configurable (providers and their identifiers, voice, admitted durations,
 * segmentation lower bound, speed-factor limit, maximum times, output size and
 * frame rate, languages, request caps) are read once, when this module is
 * first imported, from `backend/config/settings.default.json` merged with an
 * optional override at `SETTINGS_PATH` (default `data/settings.json`). The
 * export names are unchanged. The shipped defaults hold the measured values
 * the earlier literals had. An invalid file throws here, so the server never
 * starts. Everything not in that list stays a literal below.
 *
 * This module holds no credential (task 10.3) — credentials load separately
 * via `loadCredential` (./credentials.ts), and a settings file cannot carry one.
 */

import { join } from "node:path";
import { loadSettings } from "./settings.ts";

/** `SETTINGS_DEFAULTS_PATH` wins (the packaged app writes the embedded defaults to its data folder, JOS-205); otherwise `backend/config/settings.default.json`. */
export function resolveSettingsDefaultsPath(env: Record<string, string | undefined> = process.env): string {
  return env.SETTINGS_DEFAULTS_PATH || join(import.meta.dirname, "../../config/settings.default.json");
}

const loadedSettings = loadSettings({
  defaultsPath: resolveSettingsDefaultsPath(),
  overridePath: process.env.SETTINGS_PATH ?? "data/settings.json",
});
if (!loadedSettings.ok) {
  throw new Error(`Invalid settings, the application cannot start:\n${loadedSettings.problems.map((problem) => `  - ${problem}`).join("\n")}`);
}
const settings = loadedSettings.settings;

/** The validated settings as a whole, for the first provider profiles (manage-providers-from-admin, JOS-218, Decision 8). */
export const SETTINGS = settings;

// ---- Providers and version identifiers per stage (task 10.2) ----
// Stage identifiers follow the PRD's own names (backend-standards.md), not
// the capability-descriptive labels this spike's own tasks.md uses
// ("reasoning" below is PRD's "decomposition" stage).

export const DECOMPOSITION_PROVIDER = settings.decomposition;

/**
 * moderate-script-at-submission (JOS-187): the reasoning provider's own
 * moderation endpoint checks the script before a session is registered.
 * Pinned to a dated snapshot (report: step 1); `-latest` is not a pin.
 */
export const SCRIPT_MODERATION = {
  name: "OpenAI",
  model: "omni-moderation-2024-09-26",
} as const;

/**
 * "Quality" is the output format: there is no separate tier beyond model +
 * output encoding (report: step 4). A `speed` of "default" is the provider's own.
 */
export const VOICE_PROVIDER = settings.voice;

export const ALIGNMENT_PROVIDER = {
  ...settings.alignment,
  /** Same account as VOICE_PROVIDER — task 7.5a: derive any shared cap jointly, not independently. */
  sharesAccountWith: "voice" as const,
} as const;

export const IMAGE_PROVIDER = { name: settings.image.name, model: settings.image.model };

/**
 * use-reference-image-in-generation (JOS-202) — the Fal model a request goes to when its session has a reference image.
 * Chosen by the spike (`openspec/changes/use-reference-image-in-generation/reports/2026-10-26-step-1-reference-model-spike.md`):
 * the only candidate that held the character, followed the scene and returned 1920x1088.
 */
export const IMAGE_REFERENCE_MODEL = settings.imageReferenceModel;

/**
 * RunningHub versions by endpoint path, not a separate version field
 * (report: step 3, task 3.4). A path retirement fails calls outright with
 * no fallback (§11.2) — review RunningHub's model catalog periodically for
 * a deprecation notice on this path.
 */
export const VIDEO_PROVIDER = { name: settings.video.name, endpoint: settings.video.endpoint };

/**
 * configure-providers-and-parameters (JOS-174), design Decision 7 — image and video scenes are bound to the
 * provider's name. Before that, a scene was bound to the model (image) or the endpoint path (video), and the
 * only values any build wrote were these two shipped defaults, because nothing was configurable. They stay
 * as a second key for the same adapter so a scene bound by an earlier build still resolves. They are
 * literals on purpose: they name what was stored, not what is configured now.
 */
export const LEGACY_IMAGE_PROVIDER_IDENTIFIER = "fal-ai/flux/dev";
export const LEGACY_VIDEO_PROVIDER_IDENTIFIER = "/openapi/v2/minimax/hailuo-h3/image-to-video";

// ---- Supported languages (§4.1, D09) — replaces the placeholder in ./languages.ts ----
// The shipped defaults list the languages verified across all three chain
// stages (voice, alignment, decomposition), not an advertised list (Decision 4;
// report: step 6). Adding one in a settings file is the Administrator's
// responsibility: the application only checks that the code is two lowercase letters.

export type SupportedLanguageCode = string;

export const SUPPORTED_LANGUAGES: ReadonlyArray<{ code: SupportedLanguageCode; label: string }> = settings.languages;

export const SUPPORTED_LANGUAGE_CODES: readonly SupportedLanguageCode[] = settings.languages.map((language) => language.code);

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
export const VIDEO_ADMITTED_DURATION_SECONDS = settings.video.admittedDurationSeconds;

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
 * were verified with real calls in JOS-165 (report: step 3); 8 s and 11 s were
 * verified in JOS-140's manual test (report: step 8, 2026-09-28); the other
 * whole seconds come from the provider's documentation. The provider does not
 * return exactly the requested length (5 s gave 5.17 s, 11 s gave 11.54 s, 15 s
 * gave 15.08 s), so callers must use a clip's measured duration. If a value is
 * rejected, this list shrinks and the grouping's optimisation follows. Derived
 * from the range above so the two cannot drift apart; JOS-147 reuses it.
 */
export const VIDEO_ADMITTED_DURATIONS_SECONDS: readonly number[] = Array.from(
  { length: VIDEO_ADMITTED_DURATION_SECONDS.max - VIDEO_ADMITTED_DURATION_SECONDS.min + 1 },
  (_, offset) => VIDEO_ADMITTED_DURATION_SECONDS.min + offset,
);

export const SEGMENTATION_LOWER_BOUND_SECONDS = settings.segmentation.lowerBoundSeconds;
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
  ...settings.output,
  videoCodec: "H.264",
  audioCodec: "AAC",
} as const;

// ---- Per-stage request caps (§10.1, Decision 6) ----
// Every capped stage has a number (limit-provider-requests-per-stage, JOS-167,
// product owner decision 2026-10-09). `concurrency.ts` sets each stage's limit
// from this constant, and nothing else sets one.

export type CappedStage = "decomposition" | "image" | "voice" | "alignment" | "video";

// Shipped defaults (backend/config/settings.default.json): decomposition 50 (500 req/min, OpenAI,
// measured, ÷ 10 headroom factor — provisional pending group 8 latency data); image 200 (2000, Fal.ai,
// measured, ÷ 10 — provisional, the rate-limit window's time unit is unconfirmed); voice 3 and alignment 2
// (ElevenLabs Creator tier documents 5 concurrent requests per account, shared by both: 3 + 2, documented,
// not measured — see ALIGNMENT_PROVIDER.sharesAccountWith); video 3 (RunningHub: the highest concurrency
// measured with no slowdown, JOS-165 step 8.2).
export const MAX_SIMULTANEOUS_REQUESTS: Record<CappedStage, number> = settings.maxSimultaneousRequests;

// ---- Per-phase maximum times (§10.1, Decision 7) ----
// Provisional — 4-7 real samples per stage (report: step 8), enough to see
// rough spread, not a rigorous percentile study. Revisit if real-world
// timeout failure rates suggest these margins are wrong.

// Shipped defaults (backend/config/settings.default.json): decomposition 600 s (208.6 s for 67 fragments,
// 75 s for 11, 2026-10-13, real script size, JOS-197; 6.41-8.47 s on a short script, JOS-165); image 120 s
// (observed 9.22-10.79 s for text-to-image; 15-78 s with a reference image on `fal-ai/flux-2/edit`, 2026-10-26, JOS-202); voice 600 s (151 s for 10,217 characters, about 12.8 min of narration,
// 2026-10-13, JOS-197; 2.20-2.47 s on a 142-character script, JOS-165); alignment 5 s (observed 0.26-0.48 s);
// video 1200 s (grows with the clip's length at 2K: 394 s for 7 s, 528 s for 12 s, 546 s for 13 s, over 610 s
// for 14 s, 2026-10-14, JOS-197; 141-159 s on early samples, JOS-165; 15 s is admitted); assembly has none
// (define-media-assembly, JOS-182, report: step 8, task 8.5). All provisional.
// A setting of `null` means the stage is not timed and is exported as "undetermined", the marker
// `retry/attemptDeadline.ts` reads as "no deadline" (spec stage-execution-time-limit).
type PhaseStage = "decomposition" | "image" | "voice" | "alignment" | "video" | "assembly";

function phaseLimit(seconds: number | null): number | "undetermined" {
  return seconds === null ? "undetermined" : seconds;
}

export const PER_PHASE_MAX_TIME_SECONDS: Record<PhaseStage, number | "undetermined"> = {
  decomposition: phaseLimit(settings.maxTimeSeconds.decomposition),
  image: phaseLimit(settings.maxTimeSeconds.image),
  voice: phaseLimit(settings.maxTimeSeconds.voice),
  alignment: phaseLimit(settings.maxTimeSeconds.alignment),
  video: phaseLimit(settings.maxTimeSeconds.video),
  assembly: phaseLimit(settings.maxTimeSeconds.assembly),
};

/**
 * A stage's timeout in milliseconds, or `undefined` when the stage is not
 * timed. Every place that turns a maximum time into a timeout uses this, so a
 * stage with no maximum is never given a 0 ms one (design Decision 3).
 */
export function phaseTimeoutMs(stage: PhaseStage): number | undefined {
  const seconds = PER_PHASE_MAX_TIME_SECONDS[stage];
  return seconds === "undetermined" ? undefined : seconds * 1000;
}

/** Moderation runs while the User waits (JOS-187). Provisional: observed 0.12-2.2 s (report: step 1). */
export const MODERATION_MAX_TIME_SECONDS = 10;

// ---- Speed-factor limit (§7.2, §7.3) ----
// define-media-assembly (JOS-182, ADR 0005 Decision 5, PR #3, Accepted
// 2026-09-26) measured a sharply asymmetric *mechanism* on the signed
// playback-rate multiplier (speed-up: 0% duplicate frames up to 2.0×;
// slow-down: duplication growing as `1 - rate`, reaching 50% at 0.5×) but
// recommended a *numeric range* of 0.5× (floor) to 2.0× (ceiling) that is
// reciprocal in both directions (ADR "Design open questions, answered" §2:
// "asymmetric in basis, not ... in the recommended number"). Because this
// module's `speed_factor` (record-speed-adjustment-factor, JOS-148) is the
// unsigned `max(requested/narrated, narrated/requested) >= 1`, a signed
// floor of 0.5x and a signed ceiling of 2.0x both map to the same unsigned
// value — 1/0.5 = 2.0 and 2.0/1 = 2.0 — so one scalar limit on the unsigned
// factor is sufficient; no direction-aware comparison is needed.
export const SPEED_FACTOR_LIMIT: number = settings.speedFactorLimit;

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
 * owner. Resolved at the entry point by moderate-script-at-submission
 * (JOS-187): the script is checked by OpenAI's moderation endpoint before a
 * session exists, so a disallowed script is refused with a visible cause.
 * This flag stays `false` because the downstream stages still have no signal.
 */
export const NOT_RETRYABLE_FAILURE_SIGNAL_CONFIRMED = false;

// ---- Retry policy (§10.1, bounded-retry-policy JOS-184) ----

/** §10.1: the initial attempt plus three automatic retries. */
export const MAX_ATTEMPTS_PER_CYCLE = 4;

/** PRD §11.3 (JOS-203 B5): delay is `min(base × 2^(attempt−1), cap)` seconds; a provider's Retry-After is never undercut. */
export const RETRY_DELAY_SECONDS = { base: 2, cap: 30 } as const;
