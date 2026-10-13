import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import * as concurrency from "../src/concurrency.ts";
import { resetAll } from "../src/db.ts";
import { resetImageProviderRegistry, setImageProviderRegistry, createStubImageProvider } from "../src/imageProvider.ts";
import {
  events,
  resetAssemblyTool,
  resetVideoPollIntervalMs,
  resetVideoStageStartDelayMs,
  setAssemblyTool,
  setVideoPollIntervalMs,
  setVideoStageStartDelayMs,
  toSnapshot,
} from "../src/orchestrator.ts";
import { buildApp } from "../src/server.ts";
import { createStubAssemblyTool } from "../src/stubAssemblyTool.ts";
import {
  createStubVideoProvider,
  resetVideoDownloadFetch,
  resetVideoProviderRegistry,
  setVideoProviderRegistry,
  STUB_VIDEO_PROVIDER_NAME,
} from "../src/videoProvider.ts";
import { createStubVoiceProvider, setVoiceProviderRegistry } from "../src/voiceProvider.ts";
import type { SessionSnapshot } from "../src/types.ts";
import { installStubDecompositionDependencies, removeStubDecompositionDependencies } from "./decompositionStubs.ts";

// run-session-end-to-end (JOS-195), spec "A session created through the API reaches its final video": every provider
// and the assembly tool are stubs, and no /internal/test/* endpoint exists (ALLOW_TEST_ENDPOINTS is unset).

const PNG_1920_1088 = (() => {
  const buf = Buffer.alloc(29);
  buf.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  buf.writeUInt32BE(13, 8);
  buf.write("IHDR", 12, "ascii");
  buf.writeUInt32BE(1920, 16);
  buf.writeUInt32BE(1088, 20);
  return buf;
})();
const MP4_FTYP = Buffer.from("00000000667479706d703432", "hex");

let app: FastifyInstance;
const states: string[] = [];
const onState = (snapshot: SessionSnapshot) => states.push(snapshot.session.state);

beforeEach(async () => {
  delete process.env.ALLOW_TEST_ENDPOINTS;
  resetAll();
  concurrency.resetAll();
  states.length = 0;
  events.on("state", onState);
  setVideoStageStartDelayMs(0);
  setVideoPollIntervalMs(5);
  setVoiceProviderRegistry({ defaultIdentifier: "stub-voice", adapters: { "stub-voice": createStubVoiceProvider("success") } });
  installStubDecompositionDependencies();
  setImageProviderRegistry({
    defaultIdentifier: "stub-image",
    adapters: { "stub-image": createStubImageProvider("success-bytes", { bytes: PNG_1920_1088 }) },
  });
  setVideoProviderRegistry({
    defaultIdentifier: STUB_VIDEO_PROVIDER_NAME,
    adapters: { [STUB_VIDEO_PROVIDER_NAME]: createStubVideoProvider("success-bytes", { bytes: MP4_FTYP }) },
  });
  setAssemblyTool(createStubAssemblyTool({ kind: "success" }));
  app = await buildApp();
});

afterEach(async () => {
  events.off("state", onState);
  await app.close();
  removeStubDecompositionDependencies();
  resetAssemblyTool();
  resetImageProviderRegistry();
  resetVideoProviderRegistry();
  resetVideoDownloadFetch();
  resetVideoStageStartDelayMs();
  resetVideoPollIntervalMs();
});

async function waitFor(condition: () => boolean, timeoutMs = 4000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`timed out; states seen: ${[...new Set(states)].join(" > ")}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe("a session created through the API", () => {
  it("reaches final-video with no test endpoint and no user action", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/sessions",
      payload: { title: "End to end", script: "The harbor is quiet at dusk.", language: "en" },
    });
    expect(created.statusCode).toBe(201);
    const sessionId = created.json().session.sessionId as string;

    await waitFor(() => toSnapshot(sessionId)?.session.state === "final-video");

    const seen = [...new Set(states)];
    expect(seen).toContain("voice-over-complete");
    expect(seen).toContain("chunk-decomposing");
    expect(seen).toContain("chunks-processing");
    expect(seen.at(-1)).toBe("final-video");
  });

  it("exposes no test-only endpoint", async () => {
    const response = await app.inject({ method: "POST", url: "/internal/test/quick-scene", payload: {} });

    expect(response.statusCode).toBe(404);
  });
});
