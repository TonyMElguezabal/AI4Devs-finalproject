import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import * as concurrency from "../src/concurrency.ts";
import {
  APP_DATA_DIR,
  clearReferenceImage,
  commitSceneResult,
  createRun,
  db,
  getRun,
  getScene,
  getScenesForRun,
  markImageComplete,
  resetAll,
  resolveArtefactPath,
  saveReferenceImage,
  writeArtefactOnce,
} from "../src/db.ts";
import { launchImageStage, launchVideoStageForRun, resetVideoStageStartDelayMs, setVideoStageStartDelayMs } from "../src/orchestrator.ts";
import { resetVideoProviderRegistry, setVideoProviderRegistry, type VideoProvider } from "../src/videoProvider.ts";
import {
  createStubImageProvider,
  resetDownloadFetch,
  resetImageProviderRegistry,
  setImageProviderRegistry,
  type ImageProvider,
  type ReferenceImage,
} from "../src/imageProvider.ts";
import { registerDecomposition, type SegmentedFragment } from "../src/sceneRegistration.ts";
import { STAGE } from "../src/types.ts";
import type { VisualInstructionGenerator } from "../src/visualInstructions.ts";

// use-reference-image-in-generation (JOS-202) — the per-session snapshot of the /admin reference image and its use
// by every image request of that session, including retries (spec reference-image-generation).

const TEST_PROVIDER_ID = "test-image-adapter";
const REFERENCE_BYTES = Buffer.from("first reference image bytes");
const OTHER_BYTES = Buffer.from("replacement reference image bytes");
const sha256 = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");

function buildPng(width: number, height: number): Buffer {
  const buf = Buffer.alloc(29);
  buf.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  buf.writeUInt32BE(13, 8);
  buf.write("IHDR", 12, "ascii");
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}
const ACCEPTED_PNG = buildPng(1920, 1088);

const stubGenerator = (): VisualInstructionGenerator => ({
  async generate(texts) {
    return { kind: "success", pairs: texts.map((_, i) => ({ image: `image instruction ${i + 1}`, video: `video instruction ${i + 1}` })) };
  },
});

/** Stores `bytes` as the /admin reference image, the way the settings routes do: a file under the app data folder. */
function saveAdminReference(bytes: Buffer, contentType = "image/png", relativePath = "admin/reference-image.png"): void {
  const full = join(APP_DATA_DIR, relativePath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, bytes);
  saveReferenceImage(relativePath, contentType);
}

function waitFor(predicate: () => boolean, timeoutMs = 5000, intervalMs = 5): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      if (predicate()) return resolve();
      if (Date.now() - start > timeoutMs) return reject(new Error("waitFor timed out"));
      setTimeout(tick, intervalMs);
    };
    tick();
  });
}

async function registeredScenes(count: number): Promise<{ runId: string; sceneIds: string[]; projectFolder: string }> {
  const runId = randomUUID();
  const texts = Array.from({ length: count }, (_, i) => `Fragment number ${i + 1} stands alone.`);
  const run = createRun(runId, "Reference image test", texts.join(" "), "en");
  const fragments: SegmentedFragment[] = texts.map((text, i) => ({ text, narrationInterval: { startSeconds: i * 6, endSeconds: i * 6 + 6 } }));
  const result = await registerDecomposition(runId, fragments, stubGenerator(), count * 6);
  if (!result.ok) throw new Error("fixture registration failed");
  return { runId, sceneIds: result.sceneIds, projectFolder: run.projectFolder };
}

function useStubAdapter(adapter: ImageProvider): void {
  setImageProviderRegistry({ defaultIdentifier: TEST_PROVIDER_ID, adapters: { [TEST_PROVIDER_ID]: adapter } });
}

/** An adapter that records the reference it was given on every call and then succeeds. */
function recordingAdapter(): ImageProvider & { references: Array<ReferenceImage | undefined> } {
  const references: Array<ReferenceImage | undefined> = [];
  return {
    references,
    async generate(_instruction, referenceImage) {
      references.push(referenceImage);
      return { kind: "success", image: { source: "bytes", bytes: ACCEPTED_PNG, contentType: "image/png" } };
    },
  };
}

beforeEach(() => {
  resetVideoStageStartDelayMs();
  resetAll();
  concurrency.resetAll();
  concurrency.setLimit(STAGE, 10);
  setVideoStageStartDelayMs(9_999_999);
  resetImageProviderRegistry();
  resetDownloadFetch();
  clearReferenceImage();
});

describe("A session snapshots the reference image at creation", () => {
  it("copies the saved image into the project folder and records its type and hash", () => {
    saveAdminReference(REFERENCE_BYTES);

    const run = createRun(randomUUID(), "Snapshot test", "A script.", "en");

    expect(run.referenceImage).toEqual({ path: "reference-image.png", contentType: "image/png", sha256: sha256(REFERENCE_BYTES) });
    expect(readFileSync(resolveArtefactPath(run.projectFolder, "reference-image.png")).equals(REFERENCE_BYTES)).toBe(true);
    expect(getRun(run.id)?.referenceImage).toEqual(run.referenceImage);
  });

  it("uses the extension of the stored content type", () => {
    saveAdminReference(REFERENCE_BYTES, "image/webp", "admin/reference-image.webp");
    const run = createRun(randomUUID(), "Webp test", "A script.", "en");
    expect(run.referenceImage?.path).toBe("reference-image.webp");
  });

  it("records no reference when none is saved", () => {
    const run = createRun(randomUUID(), "No reference", "A script.", "en");
    expect(run.referenceImage).toBeNull();
    expect(getRun(run.id)?.referenceImage).toBeNull();
    expect(existsSync(join(run.projectFolder, "reference-image.png"))).toBe(false);
  });

  it("records no reference when the saved file has vanished, instead of failing the creation", () => {
    saveAdminReference(REFERENCE_BYTES);
    rmSync(join(APP_DATA_DIR, "admin/reference-image.png"));
    const run = createRun(randomUUID(), "Vanished", "A script.", "en");
    expect(run.referenceImage).toBeNull();
  });

  it("keeps the snapshot when the /admin image is replaced or removed afterwards", () => {
    saveAdminReference(REFERENCE_BYTES);
    const run = createRun(randomUUID(), "Stable snapshot", "A script.", "en");

    saveAdminReference(OTHER_BYTES);
    expect(getRun(run.id)?.referenceImage?.sha256).toBe(sha256(REFERENCE_BYTES));
    clearReferenceImage();
    rmSync(join(APP_DATA_DIR, "admin/reference-image.png"), { force: true });

    expect(getRun(run.id)?.referenceImage?.sha256).toBe(sha256(REFERENCE_BYTES));
    expect(readFileSync(resolveArtefactPath(run.projectFolder, "reference-image.png")).equals(REFERENCE_BYTES)).toBe(true);
  });
});

describe("Every image request of a session carries its snapshot", () => {
  it("passes the snapshot to the adapter for every scene", async () => {
    saveAdminReference(REFERENCE_BYTES);
    const { sceneIds } = await registeredScenes(3);
    const adapter = recordingAdapter();
    useStubAdapter(adapter);

    for (const id of sceneIds) launchImageStage(id);
    await waitFor(() => adapter.references.length === 3);

    for (const reference of adapter.references) {
      expect(reference).toEqual({ bytes: REFERENCE_BYTES, contentType: "image/png", sha256: sha256(REFERENCE_BYTES) });
    }
  });

  it("passes no reference for a session created without one", async () => {
    const { sceneIds } = await registeredScenes(1);
    const adapter = recordingAdapter();
    useStubAdapter(adapter);

    launchImageStage(sceneIds[0]!);
    await waitFor(() => adapter.references.length === 1);

    expect(adapter.references[0]).toBeUndefined();
  });

  it("a retry after the /admin image changed still carries the original snapshot", async () => {
    saveAdminReference(REFERENCE_BYTES);
    const { sceneIds } = await registeredScenes(1);
    const references: Array<ReferenceImage | undefined> = [];
    useStubAdapter({
      async generate(_instruction, referenceImage) {
        references.push(referenceImage);
        if (references.length === 1) return { kind: "failed_transient", reason: "stub: transient" };
        return { kind: "success", image: { source: "bytes", bytes: ACCEPTED_PNG, contentType: "image/png" } };
      },
    });

    launchImageStage(sceneIds[0]!);
    await waitFor(() => references.length === 1);
    saveAdminReference(OTHER_BYTES);
    clearReferenceImage();
    // The automatic retry is scheduled by the retry policy; relaunching is what it does and what recovery does.
    await waitFor(() => getScene(sceneIds[0]!)?.status === "submitted" || getScene(sceneIds[0]!)?.status === "image-generating");
    launchImageStage(sceneIds[0]!);
    await waitFor(() => references.length >= 2);

    expect(references[1]?.sha256).toBe(sha256(REFERENCE_BYTES));
  });
});

describe("A missing snapshot file fails only that scene, not retryable", () => {
  it("names the missing reference file and sends no request", async () => {
    saveAdminReference(REFERENCE_BYTES);
    const { runId, sceneIds, projectFolder } = await registeredScenes(2);
    rmSync(resolveArtefactPath(projectFolder, "reference-image.png"));
    const stub = createStubImageProvider("success-bytes", { bytes: ACCEPTED_PNG });
    useStubAdapter(stub);

    launchImageStage(sceneIds[0]!);
    await waitFor(() => getScene(sceneIds[0]!)?.status === "failed");

    expect(stub.calls).toEqual([]);
    expect(getScene(sceneIds[0]!)?.lastError).toContain("reference image file is missing");
    expect(getRun(runId)?.referenceImage).not.toBeNull();
  });
});

describe("Records hold the hash, never the image", () => {
  it("stores no reference bytes in the run row or the provider requests", async () => {
    saveAdminReference(REFERENCE_BYTES);
    const { runId, sceneIds } = await registeredScenes(1);
    useStubAdapter(recordingAdapter());

    launchImageStage(sceneIds[0]!);
    await waitFor(() => getScene(sceneIds[0]!)?.status === "image-complete");

    const dump = JSON.stringify({
      run: db.prepare("SELECT * FROM runs WHERE id = ?").get(runId),
      requests: db.prepare("SELECT * FROM provider_requests").all(),
    });
    expect(dump).toContain(sha256(REFERENCE_BYTES));
    expect(dump).not.toContain(REFERENCE_BYTES.toString("base64"));
    expect(dump).not.toContain(REFERENCE_BYTES.toString("utf8"));
  });
});

describe("The video stage is not affected", () => {
  it("submits the same parameters, with no reference, for a session that has a snapshot", async () => {
    saveAdminReference(REFERENCE_BYTES);
    const { runId } = await registeredScenes(1);
    const run = getRun(runId)!;
    for (const scene of getScenesForRun(runId)) {
      const relativePath = writeArtefactOnce(run.projectFolder, `scene-${scene.index}.png`, ACCEPTED_PNG);
      commitSceneResult(scene.id, relativePath);
      markImageComplete(scene.id, relativePath);
    }
    const submitted: Array<Record<string, unknown>> = [];
    const video: VideoProvider = {
      async submit(params) {
        submitted.push(params);
        return { kind: "submitted", requestId: `req-${randomUUID()}` };
      },
      async poll() {
        return { kind: "pending" };
      },
    };
    setVideoProviderRegistry({ defaultIdentifier: "test-video", adapters: { "test-video": video } });
    setVideoStageStartDelayMs(0);

    launchVideoStageForRun(runId);
    await waitFor(() => submitted.length === 1);

    expect(Object.keys(submitted[0]!).sort()).toEqual(["durationSeconds", "imageBytes", "instruction"]);
    resetVideoProviderRegistry();
  });
});

describe("Migration 23 (snapshot columns)", () => {
  it("adds three nullable columns to runs and records the version", () => {
    const columns = db.prepare("PRAGMA table_info(runs)").all() as Array<{ name: string; notnull: number }>;
    for (const name of ["reference_image_path", "reference_image_content_type", "reference_image_sha256"]) {
      expect(columns.find((c) => c.name === name)?.notnull).toBe(0);
    }
    expect(db.prepare("SELECT version FROM schema_migrations WHERE version = 23").get()).toBeDefined();
  });

  it("reads a session stored without the columns' values as having no reference", () => {
    db.prepare("INSERT INTO runs (id, title, created_at, paused) VALUES ('legacy', 'Legacy', '2026-01-01T00:00:00.000Z', 0)").run();
    expect(getRun("legacy")?.referenceImage).toBeNull();
  });
});
