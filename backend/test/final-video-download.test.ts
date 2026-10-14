import { rmSync, writeFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import * as concurrency from "../src/concurrency.ts";
import {
  commitSceneResult,
  createRun,
  getRun,
  getScenesForRun,
  insertVoiceOver,
  markImageComplete,
  resetAll,
  resolveArtefactPath,
  writeArtefactOnce,
} from "../src/db.ts";
import {
  launchVideoStageForRun,
  resetAssemblyLaunchCount,
  resetAssemblyTool,
  resetVideoStageStartDelayMs,
  setAssemblyTool,
} from "../src/orchestrator.ts";
import { createStubAssemblyTool, type StubAssemblyMode } from "../src/stubAssemblyTool.ts";
import { createStubVideoProvider, resetVideoDownloadFetch, resetVideoProviderRegistry, setVideoProviderRegistry } from "../src/videoProvider.ts";
import { registerDecomposition, type SegmentedFragment } from "../src/sceneRegistration.ts";
import { buildApp } from "../src/server.ts";
import { ulid } from "../src/util/ulid.ts";
import type { VisualInstructionGenerator } from "../src/visualInstructions.ts";

// download-final-video (JOS-164), groups 2-3 — the published contract (design
// Decision 1) and proving AC1/AC2 by actually downloading the file (design
// Decision 4): no prior test ever did.

const ACCEPTED_PNG = buildPng(1920, 1088);
const MP4_BYTES = buildMp4();
const FAKE_VOICE_OVER_BYTES = Buffer.from("fake-mp3-bytes");
const TEST_VIDEO_PROVIDER = "test-video-provider";

function buildPng(w: number, h: number): Buffer {
  const buf = Buffer.alloc(29);
  buf.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  buf.writeUInt32BE(13, 8);
  buf.write("IHDR", 12, "ascii");
  buf.writeUInt32BE(w, 16);
  buf.writeUInt32BE(h, 20);
  return buf;
}

function buildMp4(): Buffer {
  const buf = Buffer.alloc(12);
  buf.writeUInt32BE(12, 0);
  buf.write("ftyp", 4, "ascii");
  buf.write("mp42", 8, "ascii");
  return buf;
}

function makeScript(count: number): string {
  return Array.from({ length: count }, (_, i) => `Scene ${i + 1}.`).join(" ");
}

function makeFragments(count: number): SegmentedFragment[] {
  return Array.from({ length: count }, (_, i) => ({
    text: `Scene ${i + 1}.`,
    narrationInterval: { startSeconds: i * 5, endSeconds: (i + 1) * 5 },
  }));
}

function stubGenerator(): VisualInstructionGenerator {
  return {
    async generate(texts) {
      return { kind: "success", pairs: texts.map((_, i) => ({ image: `img ${i + 1}`, video: `vid ${i + 1}` })) };
    },
  };
}

/** A stub that actually writes bytes to outputPath, like a real adapter would (JOS-159 pattern) — the bare stub never does. */
function fileWritingAssemblyTool(mode: StubAssemblyMode = { kind: "success" }): ReturnType<typeof createStubAssemblyTool> {
  return {
    async assemble(input) {
      writeFileSync(input.outputPath, MP4_BYTES);
      return createStubAssemblyTool(mode).assemble(input);
    },
  };
}

function addFakeVoiceOver(runId: string, sceneCount: number): void {
  const run = getRun(runId)!;
  const rel = writeArtefactOnce(run.projectFolder, "voice-over.mp3", FAKE_VOICE_OVER_BYTES);
  insertVoiceOver({
    runId,
    audioPath: rel,
    timestampsPath: null,
    durationSeconds: sceneCount * 5,
    sizeBytes: FAKE_VOICE_OVER_BYTES.length,
    nativeTimestampsAvailable: false,
    providerRequestId: "fake-request",
    completedAt: new Date().toISOString(),
  });
}

async function waitFor(predicate: () => boolean, ms = 3000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("waitFor timed out");
    await new Promise((r) => setTimeout(r, 5));
  }
}

async function bringToFinalVideo(runId: string, sceneCount: number): Promise<void> {
  const fragments = makeFragments(sceneCount);
  const regResult = await registerDecomposition(runId, fragments, stubGenerator(), sceneCount * 5);
  if (!regResult.ok) throw new Error(`registration failed: ${regResult.reason}`);
  addFakeVoiceOver(runId, sceneCount);

  const run = getRun(runId)!;
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

let app: FastifyInstance;

beforeEach(async () => {
  resetVideoStageStartDelayMs();
  resetAll();
  resetVideoProviderRegistry();
  resetVideoDownloadFetch();
  concurrency.resetAll();
  resetAssemblyLaunchCount();
  resetAssemblyTool();
  setAssemblyTool(fileWritingAssemblyTool());
  setVideoProviderRegistry({
    defaultIdentifier: TEST_VIDEO_PROVIDER,
    adapters: { [TEST_VIDEO_PROVIDER]: createStubVideoProvider("success-bytes", { bytes: MP4_BYTES }) },
  });
  app = await buildApp();
  await app.ready();
});

describe("The published contract describes the final-video download as binary (JOS-164, design Decision 1)", () => {
  it("GET /docs/json describes the 200 response as video/mp4, not application/json", async () => {
    const res = await app.inject({ method: "GET", url: "/docs/json" });
    const document = res.json() as {
      paths: Record<string, Record<string, { responses?: Record<string, { content?: Record<string, unknown> }> }>>;
    };

    const route = document.paths["/sessions/{sessionId}/download/final-video"]!.get!;
    const content = route.responses!["200"]!.content!;
    expect(Object.keys(content)).toEqual(["video/mp4"]);
  });
});

describe("AC1 — the final video downloads with its real bytes and headers", () => {
  it("returns 200, video/mp4, the attachment header, Content-Length, and the stored file's own bytes", async () => {
    const runId = ulid();
    createRun(runId, "AC1 download test", makeScript(1), "en");
    await bringToFinalVideo(runId, 1);

    const res = await app.inject({ method: "GET", url: `/sessions/${runId}/download/final-video` });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("video/mp4");
    expect(res.headers["content-disposition"]).toBe('attachment; filename="final-video.mp4"');
    expect(res.headers["content-length"]).toBe(String(MP4_BYTES.length));
    expect(res.rawPayload.equals(MP4_BYTES)).toBe(true);
  });
});

describe("AC2 — refused before the final video exists (JOS-164)", () => {
  it("answers 409 while scenes are still processing (chunks-processing)", async () => {
    const runId = ulid();
    createRun(runId, "AC2 chunks-processing test", makeScript(1), "en");
    await registerDecomposition(runId, makeFragments(1), stubGenerator(), 5);

    const res = await app.inject({ method: "GET", url: `/sessions/${runId}/download/final-video` });

    expect(res.statusCode).toBe(409);
  });

  it("answers 404 once the recorded file is deleted from the project folder", async () => {
    const runId = ulid();
    createRun(runId, "AC2 missing file test", makeScript(1), "en");
    await bringToFinalVideo(runId, 1);
    const run = getRun(runId)!;
    rmSync(resolveArtefactPath(run.projectFolder, run.finalVideoPath!));

    const res = await app.inject({ method: "GET", url: `/sessions/${runId}/download/final-video` });

    expect(res.statusCode).toBe(404);
  });
});
