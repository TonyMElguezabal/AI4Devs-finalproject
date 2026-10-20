import { writeFileSync } from "node:fs";
import * as concurrency from "../src/concurrency.ts";
import {
  commitSceneResult,
  createRun,
  getRun,
  getScenesForRun,
  insertNarrationTimestamps,
  insertVoiceOver,
  markImageComplete,
  resetAll,
  writeArtefactOnce,
} from "../src/db.ts";
import type { AssemblyInput, AssemblyResult, AssemblyTool } from "../src/assemblyTool.ts";
import { ulid } from "../src/util/ulid.ts";
import { launchVideoStageForRun, resetAssemblyLaunchCount, resetAssemblyTool, resetVideoStageStartDelayMs, setAssemblyTool } from "../src/orchestrator.ts";
import { registerDecomposition, type SegmentedFragment } from "../src/sceneRegistration.ts";
import { createStubVideoProvider, resetVideoDownloadFetch, resetVideoProviderRegistry, setVideoProviderRegistry } from "../src/videoProvider.ts";
import type { VisualInstructionGenerator } from "../src/visualInstructions.ts";

// adjust-scene-pause (JOS-190) — a session whose first assembly has succeeded, with stored character timestamps so
// every scene's pause can be derived. Shared by the rebuild lifecycle tests and the pause API tests.

const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000007800000044000000000000000000000000000", "hex");
export const MP4 = Buffer.from("00000020667479706d703432", "hex");
const TEST_VIDEO_PROVIDER = "test-video-provider";
export const SCRIPT = "Scene 1. Scene 2.";

const generator: VisualInstructionGenerator = {
  async generate(texts) {
    return { kind: "success", pairs: texts.map((_, i) => ({ image: `img ${i + 1}`, video: `vid ${i + 1}` })) };
  },
};

const fragments: SegmentedFragment[] = [
  { text: "Scene 1.", narrationInterval: { startSeconds: 0, endSeconds: 5 } },
  { text: "Scene 2.", narrationInterval: { startSeconds: 5, endSeconds: 10 } },
];

/** Seven spoken characters per scene, 0.1 s each: scene 1 speaks 0-0.7 s, scene 2 speaks 5.0-5.7 s. Both pauses are 4.3 s. */
function narrationCharacters(): Array<{ text: string; start: number; end: number }> {
  const out: Array<{ text: string; start: number; end: number }> = [];
  for (const [startAt, text] of [[0, "Scene1."], [5, "Scene2."]] as const) {
    [...text].forEach((character, index) => out.push({ text: character, start: startAt + index * 0.1, end: startAt + (index + 1) * 0.1 }));
  }
  return out;
}

export async function waitFor(predicate: () => boolean, ms = 4000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("waitFor timed out");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

export type ToolMode = "success" | "transient" | "not-retryable" | { slowMs: number };

/** An assembly tool that writes a real (tiny) MP4 on success and records every input it was given. */
function tool(calls: AssemblyInput[], mode: () => ToolMode): AssemblyTool {
  return {
    async assemble(input): Promise<AssemblyResult> {
      calls.push({ ...input, clips: [...input.clips] });
      const current = mode();
      if (current === "transient") return { kind: "failed_transient", reason: "stub transient failure" };
      if (current === "not-retryable") return { kind: "failed_not_retryable", reason: "stub not-retryable failure" };
      if (typeof current === "object") await new Promise((resolve) => setTimeout(resolve, current.slowMs));
      writeFileSync(input.outputPath, MP4);
      return { kind: "success", outputPath: input.outputPath };
    },
  };
}

export interface FinishedSession {
  runId: string;
  sceneIds: string[];
  calls: AssemblyInput[];
  setMode: (next: ToolMode) => void;
}

/** Everything a test needs reset before it builds a session. Call from `beforeEach`. */
export function resetRebuildEnvironment(): void {
  resetVideoStageStartDelayMs();
  resetAll();
  resetVideoProviderRegistry();
  resetVideoDownloadFetch();
  concurrency.resetAll();
  resetAssemblyLaunchCount();
  resetAssemblyTool();
  setVideoProviderRegistry({
    defaultIdentifier: TEST_VIDEO_PROVIDER,
    adapters: { [TEST_VIDEO_PROVIDER]: createStubVideoProvider("success-bytes", { bytes: MP4 }) },
  });
}

export interface SessionOptions {
  /** Store the character timestamps (default true). Without them no pause can be derived. */
  timestamps?: boolean;
  /** Complete the scenes and let the first assembly succeed (default true). */
  finish?: boolean;
}

/**
 * A registered two-scene session. By default its first assembly has succeeded (final-video.mp4) and its character
 * timestamps are stored, so every scene's pause can be derived.
 */
export async function finishedSession(options: SessionOptions = {}): Promise<FinishedSession> {
  const { timestamps = true, finish = true } = options;
  const runId = ulid();
  createRun(runId, "Rebuild test", SCRIPT, "en");
  const run = getRun(runId)!;
  const audio = writeArtefactOnce(run.projectFolder, "voice-over.mp3", Buffer.from("fake-mp3-bytes"));
  insertVoiceOver({
    runId,
    audioPath: audio,
    timestampsPath: null,
    durationSeconds: 10,
    sizeBytes: 14,
    nativeTimestampsAvailable: false,
    providerRequestId: "fake",
    completedAt: new Date().toISOString(),
  });
  if (timestamps) {
    const characters = narrationCharacters();
    const stored = writeArtefactOnce(run.projectFolder, "narration-timestamps.json", JSON.stringify({ mechanism: "alignment", characters }));
    insertNarrationTimestamps({ runId, mechanism: "alignment", path: stored, characterCount: characters.length, obtainedAt: new Date().toISOString() });
  }

  const calls: AssemblyInput[] = [];
  let mode: ToolMode = "success";
  setAssemblyTool(tool(calls, () => mode));

  const registered = await registerDecomposition(runId, fragments, generator, 10);
  if (!registered.ok) throw new Error(`registration failed: ${registered.reason}`);
  if (finish) {
    for (const scene of getScenesForRun(runId)) {
      const rel = writeArtefactOnce(run.projectFolder, `scene-${scene.index}.png`, PNG);
      commitSceneResult(scene.id, rel);
      markImageComplete(scene.id, rel);
    }
    launchVideoStageForRun(runId);
    await waitFor(() => getRun(runId)?.finalVideoPath === "final-video.mp4");
  }
  return { runId, sceneIds: registered.sceneIds, calls, setMode: (next) => { mode = next; } };
}
