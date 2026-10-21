import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// configure-providers-and-parameters (JOS-174), task 4.5 — design Decision 7: image and video scenes are
// bound to the provider's NAME, not to its model or endpoint, so changing the model or endpoint in the
// settings does not leave scenes that are already bound without an adapter (PRD §11.2). A scene bound by
// an earlier build holds the model (image) or the endpoint path (video) that build shipped; that one value
// still resolves to the same adapter. Each test imports a fresh module graph, which is also a restart.

const LEGACY_IMAGE_IDENTIFIER = "fal-ai/flux/dev";
const LEGACY_VIDEO_IDENTIFIER = "/openapi/v2/minimax/hailuo-h3/image-to-video";

let dir: string;
let savedSettingsPath: string | undefined;
let savedFalKey: string | undefined;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "vid4you-binding-"));
  savedSettingsPath = process.env.SETTINGS_PATH;
  savedFalKey = process.env.FAL_API_KEY;
  process.env.FAL_API_KEY = "test-key-not-a-real-credential"; // the real adapter loads it; the network is stubbed
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (savedFalKey === undefined) delete process.env.FAL_API_KEY;
  else process.env.FAL_API_KEY = savedFalKey;
  if (savedSettingsPath === undefined) delete process.env.SETTINGS_PATH;
  else process.env.SETTINGS_PATH = savedSettingsPath;
  vi.resetModules();
  rmSync(dir, { recursive: true, force: true });
});

function restartWith(override?: unknown): void {
  const path = join(dir, "settings.json");
  if (override !== undefined) writeFileSync(path, JSON.stringify(override));
  process.env.SETTINGS_PATH = path;
  vi.resetModules();
}

describe("The default registries", () => {
  it("bind the image stage by provider name, and still answer to the model an earlier build stored", async () => {
    restartWith();
    const { getImageProviderRegistry } = await import("../src/imageProvider.ts");
    const registry = getImageProviderRegistry();
    expect(registry.defaultIdentifier).toBe("Fal.ai");
    expect(registry.adapters["Fal.ai"]).toBeDefined();
    expect(registry.adapters[LEGACY_IMAGE_IDENTIFIER]).toBe(registry.adapters["Fal.ai"]);
  });

  it("bind the video stage by provider name, and still answer to the endpoint an earlier build stored", async () => {
    restartWith();
    const { getVideoProviderRegistry } = await import("../src/videoProvider.ts");
    const registry = getVideoProviderRegistry();
    expect(registry.defaultIdentifier).toBe("RunningHub");
    expect(registry.adapters["RunningHub"]).toBeDefined();
    expect(registry.adapters[LEGACY_VIDEO_IDENTIFIER]).toBe(registry.adapters["RunningHub"]);
  });

  it("do not depend on the configured model or endpoint for their identifiers", async () => {
    restartWith({ image: { model: "fal-ai/flux/pro" }, video: { endpoint: "/another/endpoint" } });
    const { getImageProviderRegistry } = await import("../src/imageProvider.ts");
    const { getVideoProviderRegistry } = await import("../src/videoProvider.ts");
    expect(Object.keys(getImageProviderRegistry().adapters).sort()).toEqual([LEGACY_IMAGE_IDENTIFIER, "Fal.ai"].sort());
    expect(Object.keys(getVideoProviderRegistry().adapters).sort()).toEqual([LEGACY_VIDEO_IDENTIFIER, "RunningHub"].sort());
  });
});

describe("The image stage, end to end, with the real Fal.ai adapter and a stubbed network", () => {
  function pngHeader(width: number, height: number): Buffer {
    const buf = Buffer.alloc(29);
    buf.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
    buf.writeUInt32BE(13, 8);
    buf.write("IHDR", 12, "ascii");
    buf.writeUInt32BE(width, 16);
    buf.writeUInt32BE(height, 20);
    return buf;
  }

  /** Registers a one-chunk session, optionally pre-bound, then runs its image stage once. */
  async function runImageStage(boundProvider: string | null) {
    const urls: string[] = [];
    // Set before the modules load: the default Fal.ai adapter captures the global fetch when it is created.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        urls.push(url);
        return new Response(JSON.stringify({ images: [{ url: "https://fal.media/files/x.png" }] }), { status: 200 });
      }),
    );
    const store = await import("../src/db.ts");
    const orchestrator = await import("../src/orchestrator.ts");
    const { setDownloadFetch } = await import("../src/imageProvider.ts");
    const { registerDecomposition } = await import("../src/sceneRegistration.ts");
    const { STAGE } = await import("../src/types.ts");
    const concurrency = await import("../src/concurrency.ts");

    store.resetAll();
    concurrency.resetAll();
    concurrency.setLimit(STAGE, 10);
    orchestrator.setVideoStageStartDelayMs(9_999_999); // the video stage must not start: it would reach a real provider
    setDownloadFetch((async () => new Response(new Uint8Array(pngHeader(1920, 1088)), { status: 200, headers: { "content-type": "image/png" } })) as typeof fetch);

    const runId = "01J00000000000000000000175";
    store.createRun(runId, "Binding", "The lighthouse stands alone.", "en");
    const registered = await registerDecomposition(
      runId,
      [{ text: "The lighthouse stands alone.", narrationInterval: { startSeconds: 0, endSeconds: 6 } }],
      { generate: async (texts) => ({ kind: "success", pairs: texts.map((_, i) => ({ image: `i${i}`, video: `v${i}` })) }) },
      6,
    );
    if (!registered.ok) throw new Error("fixture registration failed");
    const sceneId = registered.sceneIds[0]!;
    if (boundProvider !== null) store.db.prepare("UPDATE scenes SET provider = ? WHERE id = ?").run(boundProvider, sceneId);

    void orchestrator.launchImageStage(sceneId);
    // The stage settles on its own; poll as the image-stage tests do.
    for (let waited = 0; ["submitted", "image-generating"].includes(store.getScene(sceneId)!.status) && waited < 3000; waited += 5) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    const scene = store.getScene(sceneId)!;
    store.resetAll();
    return { scene, urls };
  }

  it("binds a new scene to the provider name, and sends it to the configured model", async () => {
    restartWith();
    const { scene, urls } = await runImageStage(null);
    expect(scene.lastError).toBeNull();
    expect(scene.provider).toBe("Fal.ai");
    expect(scene.status).toBe("image-complete");
    expect(urls).toEqual(["https://fal.run/fal-ai/flux/dev"]);
  });

  it.each([
    ["bound by name", "Fal.ai"],
    ["bound by an earlier build, to the model it shipped", LEGACY_IMAGE_IDENTIFIER],
  ])("sends a scene %s to the new model after the model is changed", async (_label, bound) => {
    restartWith({ image: { model: "fal-ai/flux/pro" } });
    const { scene, urls } = await runImageStage(bound);
    expect(scene.status).toBe("image-complete");
    expect(scene.provider).toBe(bound); // its binding is left alone
    expect(urls).toEqual(["https://fal.run/fal-ai/flux/pro"]);
  });

  it("still fails a scene bound to a provider name the build does not ship, as not retryable", async () => {
    restartWith();
    const { scene, urls } = await runImageStage("Acme");
    expect(urls).toEqual([]);
    expect(scene.status).toBe("failed");
    expect(scene.lastError).toMatch(/Acme/);
  });
});

describe("The stage diagnostics", () => {
  it.each([
    ["image", "Fal.ai", { name: "Fal.ai", model: "fal-ai/flux/dev" }],
    ["image", LEGACY_IMAGE_IDENTIFIER, { name: "Fal.ai", model: "fal-ai/flux/dev" }],
    ["video", "RunningHub", { name: "RunningHub", model: "minimax/hailuo-h3" }],
    ["video", LEGACY_VIDEO_IDENTIFIER, { name: "RunningHub", model: "minimax/hailuo-h3" }],
  ] as const)("show a %s scene bound to %s", async (stage, identifier, shown) => {
    restartWith();
    const { describeProvider } = await import("../src/stageDiagnostics.ts");
    expect(describeProvider(stage, identifier)).toEqual(shown);
  });

  it("show the configured image model for a scene bound by name", async () => {
    restartWith({ image: { model: "fal-ai/flux/pro" } });
    const { describeProvider } = await import("../src/stageDiagnostics.ts");
    expect(describeProvider("image", "Fal.ai")).toEqual({ name: "Fal.ai", model: "fal-ai/flux/pro" });
  });
});
