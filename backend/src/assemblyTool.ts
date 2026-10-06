// assemble-final-video (JOS-149) — the assembly tool port (design.md Decision 3).
// Uses ffmpeg per ADR 0005; the port decouples the phase from the concrete adapter.

/**
 * One clip in the ordered assembly list. Frame geometry uses cumulative accounting
 * (ADR 0005, Decision 4): `cumulativeStartFrame` and `frameCount` are pre-computed
 * by the caller — the adapter applies them directly with `-frames:v`.
 */
export interface AssemblyClip {
  /** Absolute path to the MP4 clip produced by the video stage. */
  clipPath: string;
  /** Narration interval start in seconds (persisted, never re-derived). */
  narrationStartSeconds: number;
  /** Narration interval duration in seconds (persisted, never re-derived). */
  narrationDurationSeconds: number;
  /** First output frame index for this clip under cumulative accounting. */
  cumulativeStartFrame: number;
  /** Exact number of output frames for this clip (pre-computed by the caller). */
  frameCount: number;
}

/** Inputs required to assemble one final video. */
export interface AssemblyInput {
  /** Clips in ascending scene order. Must be non-empty. */
  clips: AssemblyClip[];
  /** Absolute path to the voice-over MP3/AAC file; muxed as-is, never re-encoded. */
  voiceOverPath: string;
  /** Absolute path the adapter should write the assembled MP4 to. */
  outputPath: string;
  /** Target frame rate (FINAL_OUTPUT.fps = 30). */
  fps: number;
  /** Target width (FINAL_OUTPUT.width = 1920). */
  width: number;
  /** Target height (FINAL_OUTPUT.height = 1080). */
  height: number;
}

export type AssemblyResult =
  | { kind: "success"; outputPath: string }
  | { kind: "failed_transient"; reason: string }
  | { kind: "failed_not_retryable"; reason: string };

/** The assembly tool port — implemented by the ffmpeg adapter and the test stub. */
export interface AssemblyTool {
  assemble(input: AssemblyInput): Promise<AssemblyResult>;
}
