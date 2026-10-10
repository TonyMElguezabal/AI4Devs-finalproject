import { randomUUID } from "node:crypto";
import { readdirSync, writeFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import * as concurrency from "../src/concurrency.ts";
import { buildApp } from "../src/server.ts";
import {
  commitSceneResult,
  createRun,
  db,
  getRun,
  getScenesForRun,
  insertVoiceOver,
  markImageComplete,
  resetAll,
  resolveArtefactPath,
  setFinalVideoPath,
  writeArtefactOnce,
} from "../src/db.ts";
import {
  launchVideoStageForRun,
  recoverOnBoot,
  resetAssemblyTool,
  resetVideoStageStartDelayMs,
  setAssemblyTool,
} from "../src/orchestrator.ts";
import { createStubAssemblyTool } from "../src/stubAssemblyTool.ts";
import {
  createStubVideoProvider,
  resetVideoDownloadFetch,
  resetVideoProviderRegistry,
  setVideoProviderRegistry,
} from "../src/videoProvider.ts";
import { registerDecomposition, type SegmentedFragment } from "../src/sceneRegistration.ts";
import type { VisualInstructionGenerator } from "../src/visualInstructions.ts";

// keep-project-files-locally (JOS-162), group 3 — pinning tests for the
// acceptance criteria that already held before this change (design
// Decision 4), plus the one gap this change closes (AC1's script and
// generated texts, covered separately in persistence.test.ts and
// scene-registration.test.ts).

const ACCEPTED_PNG = buildPng(1920, 1088);
const MP4_BYTES = buildMp4();
const FAKE_VOICE_OVER_BYTES = Buffer.from("fake-mp3-bytes");
const TEST_VIDEO_PROVIDER = "test-video-provider";

function buildPng(width: number, height: number): Buffer {
  const buf = Buffer.alloc(29);
  buf.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  buf.writeUInt32BE(13, 8);
  buf.write("IHDR", 12, "ascii");
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

function buildMp4(): Buffer {
  const buf = Buffer.alloc(12);
  buf.writeUInt32BE(12, 0);
  buf.write("ftyp", 4, "ascii");
  buf.write("mp42", 8, "ascii");
  return buf;
}

/** A stub that actually writes bytes to outputPath, like a real adapter would, before reporting success (JOS-159 pattern). */
function fileWritingAssemblyTool(): ReturnType<typeof createStubAssemblyTool> {
  return {
    async assemble(input) {
      writeFileSync(input.outputPath, MP4_BYTES);
      return createStubAssemblyTool({ kind: "success" }).assemble(input);
    },
  };
}

function stubGenerator(): VisualInstructionGenerator {
  return {
    async generate(texts) {
      return { kind: "success", pairs: texts.map((_, i) => ({ image: `img ${i + 1}`, video: `vid ${i + 1}` })) };
    },
  };
}

function makeFragments(count: number): SegmentedFragment[] {
  return Array.from({ length: count }, (_, i) => ({
    text: `Scene ${i + 1}.`,
    narrationInterval: { startSeconds: i * 5, endSeconds: (i + 1) * 5 },
  }));
}

function makeScript(count: number): string {
  return Array.from({ length: count }, (_, i) => `Scene ${i + 1}.`).join(" ");
}

async function waitFor(predicate: () => boolean, ms = 3000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("waitFor timed out");
    await new Promise((r) => setTimeout(r, 5));
  }
}

/** Brings a session to `final-video`: registration, voice-over + its native timestamps, every scene's image and clip, then assembly — all through stub providers/tools. */
async function bringToFinalVideo(runId: string, sceneCount: number): Promise<void> {
  const fragments = makeFragments(sceneCount);
  const regResult = await registerDecomposition(runId, fragments, stubGenerator(), sceneCount * 5);
  if (!regResult.ok) throw new Error(`registration failed: ${regResult.reason}`);

  const run = getRun(runId)!;
  const voiceOverPath = writeArtefactOnce(run.projectFolder, "voice-over.mp3", FAKE_VOICE_OVER_BYTES);
  const timestampsPath = writeArtefactOnce(run.projectFolder, "voice-over-timestamps.json", JSON.stringify({ units: [] }));
  insertVoiceOver({
    runId,
    audioPath: voiceOverPath,
    timestampsPath,
    durationSeconds: sceneCount * 5,
    sizeBytes: FAKE_VOICE_OVER_BYTES.length,
    nativeTimestampsAvailable: true,
    providerRequestId: "fake-request",
    completedAt: new Date().toISOString(),
  });

  const scenes = getScenesForRun(runId);
  for (const scene of scenes) {
    const rel = writeArtefactOnce(run.projectFolder, `scene-${scene.index}.png`, ACCEPTED_PNG);
    commitSceneResult(scene.id, rel);
    markImageComplete(scene.id, rel);
  }
  launchVideoStageForRun(runId);
  await waitFor(() => getScenesForRun(runId).every((s) => s.status === "chunk-complete"));
  await waitFor(() => getRun(runId)?.finalVideoPath != null);
}

beforeEach(() => {
  resetVideoStageStartDelayMs();
  resetAll();
  resetVideoProviderRegistry();
  resetVideoDownloadFetch();
  concurrency.resetAll();
  resetAssemblyTool();
  setAssemblyTool(fileWritingAssemblyTool());
  setVideoProviderRegistry({
    defaultIdentifier: TEST_VIDEO_PROVIDER,
    adapters: { [TEST_VIDEO_PROVIDER]: createStubVideoProvider("success-bytes", { bytes: MP4_BYTES }) },
  });
});

describe("AC1 — every media result lands in the project folder (PRD §12.2)", () => {
  it("has the voice-over, its timestamps, every scene's image and clip, and the final video, all under one folder", async () => {
    const runId = randomUUID();
    createRun(runId, "AC1 pinning test", makeScript(2), "en");
    await bringToFinalVideo(runId, 2);

    const projectFolder = getRun(runId)!.projectFolder;
    const files = readdirSync(resolveArtefactPath(projectFolder, ".")).sort();
    expect(files).toEqual(
      [
        "final-video.mp4",
        "generated-texts.json",
        "scene-1.mp4",
        "scene-1.png",
        "scene-2.mp4",
        "scene-2.png",
        "script.txt",
        "voice-over-timestamps.json",
        "voice-over.mp3",
      ].sort(),
    );
  });
});

describe("AC2 — a session's files and read are unchanged after boot recovery, however old (PRD §12.2, D04)", () => {
  it("rereads the same session and keeps the same files after recoverOnBoot, with created_at injected years in the past", async () => {
    const runId = randomUUID();
    createRun(runId, "AC2 aging test", makeScript(1), "en");
    await bringToFinalVideo(runId, 1);

    const projectFolder = getRun(runId)!.projectFolder;
    const filesBefore = readdirSync(resolveArtefactPath(projectFolder, ".")).sort();
    const runBefore = getRun(runId);
    const scenesBefore = getScenesForRun(runId);

    // Inject a clock years in the past: nothing in the system is sensitive
    // to a session's age, so this must change nothing about its files or read.
    db.prepare("UPDATE runs SET created_at = ? WHERE id = ?").run("2020-01-01T00:00:00.000Z", runId);

    recoverOnBoot();

    expect(readdirSync(resolveArtefactPath(projectFolder, ".")).sort()).toEqual(filesBefore);
    expect(getScenesForRun(runId)).toEqual(scenesBefore);
    expect({ ...getRun(runId), createdAt: runBefore!.createdAt }).toEqual(runBefore); // every other field unchanged
  });
});

describe("AC4 — a session of any age is still consultable with its results (PRD §12.2)", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp();
    await app.ready();
  });

  it("GET /sessions/:id returns 200 with its results for a session created years ago", async () => {
    const res = await app.inject({ method: "POST", url: "/sessions", payload: { title: "AC4 old session", script: makeScript(1), language: "en" } });
    expect(res.statusCode).toBe(201);
    const sessionId = res.json().session.sessionId as string;

    await bringToFinalVideo(sessionId, 1);
    db.prepare("UPDATE runs SET created_at = ? WHERE id = ?").run("2015-06-15T00:00:00.000Z", sessionId);

    const read = await app.inject({ method: "GET", url: `/sessions/${sessionId}` });

    expect(read.statusCode).toBe(200);
    expect(read.json().session.state).toBe("final-video");
    expect(read.json().session.finalVideoUrl).toBe(`/sessions/${sessionId}/download/final-video`);
    expect(read.json().scenes).toHaveLength(1);
  });
});
