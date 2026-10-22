import { randomUUID } from "node:crypto";
import { setActiveProvider } from "../src/activeProvider.ts";
import { resetAlignmentProviderRegistry, resetReasoningProviderRegistry, setAlignmentProviderRegistry, setReasoningProviderRegistry } from "../src/decompositionDependencies.ts";
import { commitSceneResult, createRun, db, getRun, getScenesForRun, insertNarrationTimestamps, markImageComplete, markSceneFailed, setRunFailure, writeArtefactOnce } from "../src/db.ts";
import { resetImageProviderRegistry, setImageProviderRegistry } from "../src/imageProvider.ts";
import { registerDecomposition, type SegmentedFragment } from "../src/sceneRegistration.ts";
import { createDecompositionFailure, createVoiceOverFailure } from "../src/sessionStateMachine.ts";
import { resetVideoProviderRegistry, setVideoProviderRegistry } from "../src/videoProvider.ts";
import type { VisualInstructionGenerator } from "../src/visualInstructions.ts";
import { resetVoiceProviderRegistry, setVoiceProviderRegistry } from "../src/voiceProvider.ts";

// move-failed-stage-to-active-provider (JOS-172) — shared fixtures: two selectable providers per stage and sessions
// whose stages failed while bound to `stub-a`, with `stub-b` active.

const adapters = { "stub-a": {}, "stub-b": {} } as never;

/** Two selectable providers per stage and `stub-b` active everywhere; adapters are placeholders (nothing is sent here). */
export function installTwoProvidersPerStage(): void {
  setVoiceProviderRegistry({ defaultIdentifier: "stub-a", adapters });
  setImageProviderRegistry({ defaultIdentifier: "stub-a", adapters });
  setVideoProviderRegistry({ defaultIdentifier: "stub-a", adapters });
  setReasoningProviderRegistry({ defaultIdentifier: "stub-a", adapters });
  setAlignmentProviderRegistry({ defaultIdentifier: "stub-a", adapters });
  for (const stage of ["voice", "image", "video", "reasoning", "alignment"] as const) setActiveProvider(stage, "stub-b");
}

export function removeTwoProvidersPerStage(): void {
  resetVoiceProviderRegistry();
  resetImageProviderRegistry();
  resetVideoProviderRegistry();
  resetReasoningProviderRegistry();
  resetAlignmentProviderRegistry();
}

const NOW = new Date("2026-10-22T10:00:00.000Z");
const COLUMN = { voice: "voice_provider_id", alignment: "alignment_provider_id", reasoning: "decomposition_provider_id" } as const;

export function newRun(title = "Failed stage test", script = "The lighthouse stands alone."): string {
  const runId = randomUUID();
  createRun(runId, title, script, "en");
  return runId;
}

export function bindSessionStage(runId: string, stage: keyof typeof COLUMN, providerId: string): void {
  db.prepare(`UPDATE runs SET ${COLUMN[stage]} = ? WHERE id = ?`).run(providerId, runId);
}

export function failVoice(runId: string, providerId = "stub-a", retryable = true): void {
  bindSessionStage(runId, "voice", providerId);
  setRunFailure(runId, createVoiceOverFailure({ cause: "the voice provider answered HTTP 503", retryable, occurredAt: NOW }));
}

/** The session failed in decomposition: in the alignment step before timestamps are stored, in the reasoning step after. */
export function failDecomposition(runId: string, step: "alignment" | "reasoning", providerId = "stub-a", retryable = true): void {
  if (step === "reasoning") insertNarrationTimestamps({ runId, mechanism: "alignment", path: "narration-timestamps.json", characterCount: 10, obtainedAt: NOW.toISOString() });
  bindSessionStage(runId, step, providerId);
  setRunFailure(runId, createDecompositionFailure({ cause: `the ${step} provider answered HTTP 503`, retryable, occurredAt: NOW }));
}

const generator: VisualInstructionGenerator = {
  async generate(texts) {
    return { kind: "success", pairs: texts.map((_, i) => ({ image: `image ${i + 1}`, video: `video ${i + 1}` })) };
  },
};

function png(): Buffer {
  const buf = Buffer.alloc(29);
  buf.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  buf.writeUInt32BE(13, 8);
  buf.write("IHDR", 12, "ascii");
  buf.writeUInt32BE(1920, 16);
  buf.writeUInt32BE(1088, 20);
  return buf;
}

/** A new session whose script is "scene 1 scene 2 ...", registered as one scene per interval length in seconds. */
export async function registerScenes(seconds: number[], title = "Scenes test"): Promise<{ runId: string; sceneIds: string[] }> {
  const texts = seconds.map((_, i) => `scene ${i + 1}`);
  const runId = newRun(title, texts.join(" "));
  let start = 0;
  const fragments: SegmentedFragment[] = seconds.map((length, i) => {
    const fragment = { text: texts[i]!, narrationInterval: { startSeconds: start, endSeconds: start + length } };
    start += length;
    return fragment;
  });
  const result = await registerDecomposition(runId, fragments, generator, start);
  if (!result.ok) throw new Error(`fixture registration failed: ${result.reason}`);
  return { runId, sceneIds: result.sceneIds };
}

/** A scene whose image stage failed while bound to `providerId`. */
export function failImage(sceneId: string, providerId = "stub-a"): void {
  db.prepare("UPDATE scenes SET provider = ? WHERE id = ?").run(providerId, sceneId);
  markSceneFailed(sceneId, "the image provider answered HTTP 503");
}

/** A scene whose image is complete and whose clip failed while bound to `providerId`. */
export function failVideo(runId: string, sceneId: string, providerId = "stub-a"): void {
  const run = getRun(runId)!;
  const scene = getScenesForRun(runId).find((candidate) => candidate.id === sceneId)!;
  const path = writeArtefactOnce(run.projectFolder, `scene-${scene.index}.png`, png());
  commitSceneResult(sceneId, path);
  markImageComplete(sceneId, path);
  db.prepare("UPDATE scenes SET video_provider = ? WHERE id = ?").run(providerId, sceneId);
  markSceneFailed(sceneId, "the video provider answered HTTP 503");
}
