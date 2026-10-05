import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DECOMPOSITION_PROVIDER,
  VOICE_PROVIDER,
  ALIGNMENT_PROVIDER,
  IMAGE_PROVIDER,
  VIDEO_PROVIDER,
  SUPPORTED_LANGUAGE_CODES,
  VIDEO_ADMITTED_DURATION_SECONDS,
  SEGMENTATION_LOWER_BOUND_SECONDS,
  SEGMENTATION_UPPER_BOUND_SECONDS,
  IMAGE_GENERATION_SIZE,
  FINAL_OUTPUT,
  MAX_SIMULTANEOUS_REQUESTS,
  PER_PHASE_MAX_TIME_SECONDS,
  SPEED_FACTOR_LIMIT,
  MAX_ATTEMPTS_PER_CYCLE,
  PROVISIONAL_RETRY_DELAY_SECONDS,
} from "../src/config/providers.ts";

// define-provider-configuration (JOS-165) task 11.2 — Decision 8 requires the
// constants module to be asserted against docs/PRD.md §11 in a test, so the
// two cannot drift apart. These expectations are exactly the values task
// group 16 transcribes into §11; changing either the module or the PRD entry
// without updating this test is the drift Decision 8 exists to catch.

describe("Provider selections match §11's five stages (JOS-165)", () => {
  it("records the decomposition (reasoning) provider and model", () => {
    expect(DECOMPOSITION_PROVIDER).toEqual({ name: "OpenAI", model: "gpt-6-astra" });
  });

  it("records the voice provider, voice and quality settings", () => {
    expect(VOICE_PROVIDER.name).toBe("ElevenLabs");
    expect(VOICE_PROVIDER.voiceId).toBe("4YYIPFl9wE5c4L2eu2Gb");
    expect(VOICE_PROVIDER.model).toBe("eleven_multilingual_v2");
  });

  it("records the alignment provider and its shared-account link to voice (task 7.5a)", () => {
    expect(ALIGNMENT_PROVIDER.name).toBe("ElevenLabs");
    expect(ALIGNMENT_PROVIDER.sharesAccountWith).toBe("voice");
  });

  it("records the image provider and model", () => {
    expect(IMAGE_PROVIDER).toEqual({ name: "Fal.ai", model: "fal-ai/flux/dev" });
  });

  it("records the video provider and its hardcoded endpoint identifier", () => {
    expect(VIDEO_PROVIDER.name).toBe("RunningHub");
    expect(VIDEO_PROVIDER.endpoint).toBe("/openapi/v2/minimax/hailuo-h3/image-to-video");
  });
});

describe("Segmentation lower bound is consistent with the video provider's admitted durations (§6.1, task 11.3)", () => {
  it("matches the measured minimum admitted duration, not an independent literal", () => {
    expect(SEGMENTATION_LOWER_BOUND_SECONDS).toBe(VIDEO_ADMITTED_DURATION_SECONDS.min);
    expect(SEGMENTATION_LOWER_BOUND_SECONDS).toBe(5);
  });

  it("upper bound matches the measured maximum admitted duration", () => {
    expect(SEGMENTATION_UPPER_BOUND_SECONDS).toBe(VIDEO_ADMITTED_DURATION_SECONDS.max);
    expect(SEGMENTATION_UPPER_BOUND_SECONDS).toBe(15);
  });
});

describe("Final assembled output matches D08 (§7.3)", () => {
  it("targets 1920x1080 at 30fps with H.264/AAC", () => {
    expect(FINAL_OUTPUT).toEqual({ width: 1920, height: 1080, fps: 30, videoCodec: "H.264", audioCodec: "AAC" });
  });

  it("image generation setting is chosen so assembly only ever downscales, never upscales", () => {
    expect(IMAGE_GENERATION_SIZE.width).toBeGreaterThanOrEqual(FINAL_OUTPUT.width);
    expect(IMAGE_GENERATION_SIZE.height).toBeGreaterThanOrEqual(FINAL_OUTPUT.height);
  });
});

describe("Per-stage request maximum stays within the recorded rate limit under the full 1+3 retry budget (§10.1, task 11.4)", () => {
  const RETRY_BUDGET_ATTEMPTS = 4; // 1 initial + 3 automatic retries

  it("decomposition (OpenAI): 500 req/min measured limit", () => {
    const cap = MAX_SIMULTANEOUS_REQUESTS.decomposition;
    expect(typeof cap).toBe("number");
    expect((cap as number) * RETRY_BUDGET_ATTEMPTS).toBeLessThan(500);
  });

  it("image (Fal.ai): 2000 measured limit", () => {
    const cap = MAX_SIMULTANEOUS_REQUESTS.image;
    expect(typeof cap).toBe("number");
    expect((cap as number) * RETRY_BUDGET_ATTEMPTS).toBeLessThan(2000);
  });

  it("voice, alignment and video are explicitly undetermined, not a guessed number (Decision 6)", () => {
    expect(MAX_SIMULTANEOUS_REQUESTS.voice).toBe("undetermined");
    expect(MAX_SIMULTANEOUS_REQUESTS.alignment).toBe("undetermined");
    expect(MAX_SIMULTANEOUS_REQUESTS.video).toBe("undetermined");
  });
});

describe("The speed-factor limit (§7.2, record-speed-adjustment-factor, JOS-148)", () => {
  it("is 2.0, the unsigned mapping of define-media-assembly's 0.5x-2.0x recommendation (ADR 0005 Decision 5)", () => {
    expect(SPEED_FACTOR_LIMIT).toBe(2.0);
  });
});

describe("Per-phase maximum times are set above the measured slow tail (Decision 7, §10.1)", () => {
  it("each numeric phase limit exceeds its own measured maximum sample", () => {
    // Measured maxima from reports/2026-09-27-step-8-timing-measurements.md
    expect(PER_PHASE_MAX_TIME_SECONDS.decomposition).toBeGreaterThan(8.47);
    expect(PER_PHASE_MAX_TIME_SECONDS.image).toBeGreaterThan(10.79);
    expect(PER_PHASE_MAX_TIME_SECONDS.voice).toBeGreaterThan(2.47);
    expect(PER_PHASE_MAX_TIME_SECONDS.alignment).toBeGreaterThan(0.48);
    expect(PER_PHASE_MAX_TIME_SECONDS.video).toBeGreaterThan(159.5);
  });

  it("assembly is explicitly undetermined pending define-media-assembly (JOS-182)", () => {
    expect(PER_PHASE_MAX_TIME_SECONDS.assembly).toBe("undetermined");
  });

  // stage-execution-time-limit (JOS-185) task 9.3 — the timeout watcher reads these values, so they are compared with
  // the PRD's own row: either side changing alone is caught here.
  it("equal the per-phase maximum times recorded in PRD §11.3", () => {
    const prd = readFileSync(resolve(import.meta.dirname, "../../docs/PRD-v1.4.md"), "utf8");
    const row = prd.split("\n").find((line) => line.startsWith("| Per-phase maximum times"));
    const match = row?.match(/Reasoning (\d+)s, Image (\d+)s, Voice (\d+)s, Alignment (\d+)s, Video (\d+)s, Assembly provisional/);

    expect(match, "the §11.3 row for the per-phase maximum times was not found").not.toBeNull();
    expect(match!.slice(1).map(Number)).toEqual([
      PER_PHASE_MAX_TIME_SECONDS.decomposition,
      PER_PHASE_MAX_TIME_SECONDS.image,
      PER_PHASE_MAX_TIME_SECONDS.voice,
      PER_PHASE_MAX_TIME_SECONDS.alignment,
      PER_PHASE_MAX_TIME_SECONDS.video,
    ]);
  });
});

describe("Supported language list contains only evidence-verified languages (Decision 4, task 11.5)", () => {
  // reports/2026-09-27-step-6-language-list-verification.md — the only two
  // languages verified across all three chain stages (voice, alignment,
  // decomposition) with real per-language calls.
  const EVIDENCE_VERIFIED_LANGUAGE_CODES = ["en", "es"] as const;

  it("every supported code was actually verified, none merely assumed", () => {
    for (const code of SUPPORTED_LANGUAGE_CODES) {
      expect(EVIDENCE_VERIFIED_LANGUAGE_CODES).toContain(code);
    }
  });

  it("no verified language is missing from the supported list", () => {
    expect([...SUPPORTED_LANGUAGE_CODES].sort()).toEqual([...EVIDENCE_VERIFIED_LANGUAGE_CODES].sort());
  });
});

describe("Retry policy constants (bounded-retry-policy, JOS-184)", () => {
  it("allows the initial attempt plus three automatic retries per cycle (§10.1)", () => {
    expect(MAX_ATTEMPTS_PER_CYCLE).toBe(4);
  });

  // PRD §11 records no retry delay base or cap yet (task 1.4 waits for US-33).
  // The values are named PROVISIONAL so no one mistakes them for PRD values;
  // when US-33 records them, replace this test with an assertion against §11.
  it("keeps the retry delays provisional and well-formed until the PRD records them", () => {
    expect(PROVISIONAL_RETRY_DELAY_SECONDS).toEqual({ base: 2, cap: 30 });
    expect(PROVISIONAL_RETRY_DELAY_SECONDS.cap).toBeGreaterThanOrEqual(PROVISIONAL_RETRY_DELAY_SECONDS.base);
  });
});
