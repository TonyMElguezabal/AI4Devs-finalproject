// assemble-final-video (JOS-149) — the assembly tool port (design.md Decision 3).
// Uses ffmpeg per ADR 0005; the port decouples the phase from the concrete adapter.

import type { SubtitleCue } from "./subtitles.ts";

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

/**
 * One change to the narration, in the stored (original) timeline (adjust-scene-pause, JOS-190, Decision 4):
 * `deltaSeconds` of silence is removed (negative: that much, centred on `atSeconds`) or inserted (positive: at
 * `atSeconds`). The caller has already shifted the clips' intervals by the same amounts.
 */
export interface NarrationEdit {
  atSeconds: number;
  deltaSeconds: number;
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
  /**
   * The User's pause edits (adjust-scene-pause, JOS-190). Absent or empty: the voice-over is muxed as-is, exactly as
   * before. Present: the narration is cut/extended at these points and encoded once, and the tool MUST verify audio
   * and video agree within one frame, failing the attempt otherwise.
   */
  narrationEdits?: readonly NarrationEdit[];
  /**
   * The subtitles to burn in (add-burned-in-subtitles, JOS-237). Absent: none are asked for. `null`: the orchestrator
   * could not build them (the narration's timestamps are missing or do not match the script), and a tool that draws
   * subtitles MUST fail the attempt as not retryable rather than deliver a video without them. An array: draw these.
   */
  subtitles?: readonly SubtitleCue[] | null;
}

export type AssemblyResult =
  | { kind: "success"; outputPath: string }
  | { kind: "failed_transient"; reason: string }
  | { kind: "failed_not_retryable"; reason: string };

/** The assembly tool port — implemented by the ffmpeg adapter and the test stub. */
export interface AssemblyTool {
  assemble(input: AssemblyInput): Promise<AssemblyResult>;
}
