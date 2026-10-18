// JOS-194 proof of concept (Decision 14) — the packaged application's entry point. Throwaway; each block names its story.
import { dataDir, ffmpegPath } from "./env.ts"; // must stay the first import (data folder, credentials, ffmpeg, release safety)
import { execFileSync, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import http from "node:http";
import { extname, join } from "node:path";
import sea from "node:sea";
import { buildApp, bootLogFields, configureAssemblyTool, initTelemetry } from "../../../../../backend/src/server.ts";
import { installProcessErrorHandlers } from "../../../../../backend/src/telemetry/processHandlers.ts";
import { shutdownTelemetry } from "../../../../../backend/src/telemetry/index.ts";
import { startUpdateCheck } from "../../../../../backend/src/telemetry/updateCheck.ts";
import { recoverOnBoot } from "../../../../../backend/src/orchestrator.ts";
import { setDecompositionLogger } from "../../../../../backend/src/decompositionPhase.ts";
import * as concurrency from "../../../../../backend/src/concurrency.ts";
import { STAGE } from "../../../../../backend/src/types.ts";
import { MAX_SIMULTANEOUS_REQUESTS } from "../../../../../backend/src/config/providers.ts";
import { setVoiceOverLogger } from "../../../../../backend/src/voiceOverPhase.ts";
import { rebuildScheduler } from "../../../../../backend/src/retry/retryScheduler.ts";
import { startAttemptTimeoutWatcher } from "../../../../../backend/src/retry/attemptTimeoutWatcher.ts";
import { setDecompositionDependencies } from "../../../../../backend/src/decompositionDependencies.ts";
import { createStubImageProvider, setImageProviderRegistry } from "../../../../../backend/src/imageProvider.ts";
import { createStubVoiceProvider, setVoiceProviderRegistry } from "../../../../../backend/src/voiceProvider.ts";
import { createStubVideoProvider, setVideoProviderRegistry, STUB_VIDEO_PROVIDER_NAME } from "../../../../../backend/src/videoProvider.ts";

const PORT = Number(process.env.VID4YOU_PORT ?? 3100);
const appUrl = `http://127.0.0.1:${PORT}/`;

// ---- Web assets: embedded in the executable (SEA assets), or read from a folder when the bundle runs under plain node ----
const webDir = process.env.VID4YOU_WEB_DIR;
const readAsset = (relative: string): Buffer | undefined => {
  if (sea.isSea()) {
    try { return Buffer.from(sea.getAsset(`web/${relative}`)); } catch { return undefined; }
  }
  const file = webDir ? join(webDir, relative) : "";
  return file && existsSync(file) ? readFileSync(file) : undefined;
};
const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".json": "application/json", ".woff2": "font/woff2",
};

// ---- Story L3: only the local user's own page may talk to the backend (Origin), and only via loopback (Host, DNS rebinding) ----
const allowedHosts = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);
const allowedOrigins = new Set([`http://127.0.0.1:${PORT}`, `http://localhost:${PORT}`]);
const rejection = (request: http.IncomingMessage): string | undefined => {
  if (!request.headers.host || !allowedHosts.has(request.headers.host)) return "host not allowed";
  const origin = request.headers.origin;
  if (origin !== undefined && !allowedOrigins.has(origin)) return "origin not allowed";
  return undefined;
};

const openBrowser = (url: string) => {
  if (process.env.VID4YOU_NO_BROWSER === "1") return;
  const [command, args] = process.platform === "darwin" ? ["open", [url]]
    : process.platform === "win32" ? ["cmd", ["/c", "start", "", url]]
      : ["xdg-open", [url]];
  spawn(command, args, { detached: true, stdio: "ignore" }).unref();
};

// ---- Story L4: one backend per user. If the port answers as Vid4You, open it and leave. ----
const alreadyRunning = (): Promise<boolean> => new Promise((resolve) => {
  const probe = http.get({ host: "127.0.0.1", port: PORT, path: "/health", timeout: 2000 }, (response) => {
    response.resume();
    resolve(response.statusCode === 200);
  });
  probe.on("error", () => resolve(false));
  probe.on("timeout", () => { probe.destroy(); resolve(false); });
});

// ---- PoC stub mode (never in a release): the providers the stubbed experiments need ----
if (process.env.POC_MODE === "stub") {
  setDecompositionDependencies({
    // The stub narration is about 1 s long; spread the script's characters over 0.95 s so the product's own
    // timestamp validation (the last character must end within the narration) accepts them.
    alignmentProvider: { async align(_audio: Uint8Array, script: string) {
      const step = 0.95 / Math.max([...script].length, 1);
      return { kind: "success", characters: [...script].map((text, i) => ({ text, start: 0.01 + i * step, end: 0.01 + (i + 1) * step })) };
    } },
    instructionGenerator: { async generate(texts: readonly string[]) {
      return { kind: "success", pairs: texts.map((_, i) => ({ image: `image ${i + 1}`, video: `video ${i + 1}` })) };
    } },
  } as never);
  const png = Buffer.alloc(29); // 1920x1088 PNG header, the smallest buffer the image stage accepts
  png.set([137, 80, 78, 71, 13, 10, 26, 10], 0); png.writeUInt32BE(13, 8); png.write("IHDR", 12, "ascii");
  png.writeUInt32BE(1920, 16); png.writeUInt32BE(1088, 20);
  setImageProviderRegistry({ defaultIdentifier: "stub-image", adapters: { "stub-image": createStubImageProvider("success-bytes", { bytes: png }) } } as never);
  setVoiceProviderRegistry({ defaultIdentifier: "stub-voice", adapters: { "stub-voice": createStubVoiceProvider("success") } } as never);
  const clipPath = join(dataDir, "poc-clip.mp4");
  if (!existsSync(clipPath)) {
    execFileSync(ffmpegPath, ["-loglevel", "error", "-f", "lavfi", "-i", "testsrc=size=1920x1088:rate=24", "-t", "1", "-pix_fmt", "yuv420p", "-c:v", "libx264", clipPath]);
  }
  const delayMs = Number(process.env.POC_STUB_VIDEO_DELAY_MS ?? 0);
  const base = createStubVideoProvider("success-bytes", { bytes: readFileSync(clipPath) });
  const firstPolled = new Map<string, number>();
  const video = delayMs > 0 ? {
    submit: base.submit.bind(base),
    async poll(requestId: string) {
      const first = firstPolled.get(requestId) ?? Date.now();
      firstPolled.set(requestId, first);
      return Date.now() - first < delayMs ? { kind: "pending" as const } : base.poll(requestId);
    },
  } : base;
  setVideoProviderRegistry({ defaultIdentifier: STUB_VIDEO_PROVIDER_NAME, adapters: { [STUB_VIDEO_PROVIDER_NAME]: video } } as never);
}

// ---- JOS-195 (merged): the real assembly tool by default, through the same function server.ts uses ----
configureAssemblyTool(process.env);

// ---- Story L1: the bootstrap server.ts runs only under `node src/server.ts` (its entry check fails in a bundle and on Windows) ----
async function main(): Promise<void> {
  if (await alreadyRunning()) {
    console.log(`Vid4You is already running at ${appUrl}; opening it.`);
    openBrowser(appUrl);
    return;
  }
  // JOS-199: the bootstrap server.ts skips in a bundle also starts telemetry, so the packaged entry must.
  initTelemetry();
  installProcessErrorHandlers();
  startUpdateCheck();
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => void shutdownTelemetry().finally(() => process.exit(0)));
  concurrency.setLimit(STAGE, Number(process.env.STAGE_CONCURRENCY_LIMIT ?? MAX_SIMULTANEOUS_REQUESTS.image));
  const app = await buildApp();
  setVoiceOverLogger(app.log);
  setDecompositionLogger(app.log);
  app.log.info(bootLogFields(recoverOnBoot()), "boot recovery complete");
  app.log.info({ scheduledRetries: rebuildScheduler() }, "scheduled retries re-armed");
  startAttemptTimeoutWatcher();
  await app.ready();

  // Put the guard and the static files in front of Fastify's own request handler.
  const fastifyHandlers = app.server.listeners("request") as ((request: http.IncomingMessage, response: http.ServerResponse) => void)[];
  app.server.removeAllListeners("request");
  app.server.on("request", (request: http.IncomingMessage, response: http.ServerResponse) => {
    const reason = rejection(request);
    if (reason) {
      response.writeHead(403, { "content-type": "text/plain" }).end(`forbidden: ${reason}`);
      return;
    }
    const path = (request.url ?? "/").split("?")[0];
    if (request.method === "GET" && (path === "/" || path === "/index.html" || path.startsWith("/assets/") || path === "/favicon.svg")) {
      const asset = readAsset(path === "/" ? "index.html" : path.slice(1));
      if (asset) {
        response.writeHead(200, { "content-type": CONTENT_TYPES[extname(path === "/" ? "index.html" : path)] ?? "application/octet-stream" }).end(asset);
        return;
      }
    }
    for (const handler of fastifyHandlers) handler.call(app.server, request, response);
  });

  await app.listen({ port: PORT, host: "127.0.0.1" });
  console.log(`Vid4You is running at ${appUrl} (data: ${dataDir})`);
  openBrowser(appUrl);
}

main().catch((error) => {
  console.error("Vid4You failed to start:", error);
  process.exit(1);
});
