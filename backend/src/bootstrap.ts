import type { FastifyInstance } from "fastify";
import * as concurrency from "./concurrency.ts";
import { STAGE } from "./types.ts";
import { setRetryDelayConfig } from "./retry/stageAttemptRecorder.ts";
import { setVoiceProviderRegistry, createStubVoiceProvider as createStubVoice, type StubVoiceProviderMode } from "./voiceProvider.ts";
import { setImageProviderRegistry, createStubImageProvider, type StubImageProviderMode } from "./imageProvider.ts";
import { setVideoProviderRegistry, createStubVideoProvider, STUB_VIDEO_PROVIDER_NAME, type StubVideoProviderMode } from "./videoProvider.ts";
import { recoverOnBoot } from "./orchestrator.ts";
import { setDecompositionLogger } from "./decompositionPhase.ts";
import { setVoiceOverLogger } from "./voiceOverPhase.ts";
import { shutdownTelemetry } from "./telemetry/index.ts";
import { startUpdateCheck } from "./telemetry/updateCheck.ts";
import { installProcessErrorHandlers } from "./telemetry/processHandlers.ts";
import { rebuildScheduler } from "./retry/retryScheduler.ts";
import { startAttemptTimeoutWatcher } from "./retry/attemptTimeoutWatcher.ts";
import { BODY_LIMIT_BYTES, PORT, bootLogFields, buildApp, configureAssemblyTool, initTelemetry, type StaticAssetReader } from "./server.ts";

// package-executables-build (JOS-205) Decision 4 — the boot sequence, moved out of `server.ts` so `npm start` and the
// packaged executable run the same code (the packaged entry only adds what is packaged-specific).
const STAGE_CONCURRENCY_OVERRIDE = process.env.STAGE_CONCURRENCY_LIMIT;

export interface StartServerOptions {
  /** The embedded interface the packaged executable serves; absent in development, where Vite serves it. */
  staticAssets?: StaticAssetReader;
}

export async function startServer(options: StartServerOptions = {}): Promise<FastifyInstance> {
  if (STAGE_CONCURRENCY_OVERRIDE) concurrency.setLimit(STAGE, Number(STAGE_CONCURRENCY_OVERRIDE));
  // USE_STUB_VIDEO_PROVIDER=success|success-bytes|pending|request-lost|transient-failure|not-retryable-failure — manual endpoint testing only.
  // `pending` leaves every clip unfinished, so a restart can be watched resuming it; `success` is an alias of `success-bytes`.
  const stubVideoMode = process.env.USE_STUB_VIDEO_PROVIDER;
  if (stubVideoMode) {
    const bytes = Buffer.from("00000000667479706d703432", "hex"); // minimal ftyp mp4
    const resolvedMode: StubVideoProviderMode = stubVideoMode === "success" ? "success-bytes"
      : (["success-bytes", "pending", "request-lost", "not-retryable-failure"] as const).find((m) => m === stubVideoMode) ?? "transient-failure";
    const stub = createStubVideoProvider(resolvedMode, { bytes });
    setVideoProviderRegistry({ defaultIdentifier: STUB_VIDEO_PROVIDER_NAME, adapters: { [STUB_VIDEO_PROVIDER_NAME]: stub } });
  }
  // USE_STUB_IMAGE_PROVIDER=success|transient-failure|not-retryable-failure — manual endpoint testing only: every image is a valid 1920x1088 PNG header.
  const stubImageMode = process.env.USE_STUB_IMAGE_PROVIDER;
  if (stubImageMode) {
    const png = Buffer.alloc(29);
    png.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
    png.writeUInt32BE(13, 8);
    png.write("IHDR", 12, "ascii");
    png.writeUInt32BE(1920, 16);
    png.writeUInt32BE(1088, 20);
    const resolvedMode: StubImageProviderMode = stubImageMode === "success" ? "success-bytes" : stubImageMode === "not-retryable-failure" ? "not-retryable-failure" : "transient-failure";
    setImageProviderRegistry({ defaultIdentifier: "stub-image", adapters: { "stub-image": createStubImageProvider(resolvedMode, { bytes: png }) } });
  }
  // RETRY_BASE_DELAY_SECONDS / RETRY_CAP_DELAY_SECONDS — manual endpoint testing only: shortens the retry delays so a retry sequence can be watched in seconds (fractions allowed).
  const retryBaseSeconds = Number(process.env.RETRY_BASE_DELAY_SECONDS);
  const retryCapSeconds = Number(process.env.RETRY_CAP_DELAY_SECONDS);
  if (Number.isFinite(retryBaseSeconds) && Number.isFinite(retryCapSeconds) && retryBaseSeconds >= 0 && retryCapSeconds >= retryBaseSeconds) {
    setRetryDelayConfig({ baseSeconds: retryBaseSeconds, capSeconds: retryCapSeconds });
  }
  // USE_STUB_VOICE_PROVIDER=success|success-without-timestamps|transient-failure|transient-twice-then-success|not-retryable-failure|undecodable-audio|empty-audio|hang|hang-once-then-success|success-after-limit — manual endpoint testing only.
  const stubVoiceMode = process.env.USE_STUB_VOICE_PROVIDER as StubVoiceProviderMode | undefined;
  // VOICE_STUB_DELAY_MS — with `success-after-limit`, how long each call takes (default: the voice maximum time plus 2 s).
  // A value below the maximum time makes calls slow but in time, so the per-stage cap's queueing can be watched (JOS-167).
  const voiceStubDelayMs = Number(process.env.VOICE_STUB_DELAY_MS);
  if (stubVoiceMode) {
    setVoiceProviderRegistry({
      defaultIdentifier: "stub-voice",
      adapters: { "stub-voice": createStubVoice(stubVoiceMode, Number.isFinite(voiceStubDelayMs) && voiceStubDelayMs > 0 ? { lateAfterMs: voiceStubDelayMs } : {}) },
    });
  }
  // USE_STUB_ASSEMBLY_TOOL=success|transient-failure|not-retryable-failure|slow-success — manual endpoint testing only (JOS-149).
  // `slow-success` (JOS-161) answers success after ASSEMBLY_STUB_DELAY_MS (default 15000), so a pause can land during assembly.
  // Without it the real ffmpeg adapter is registered (run-session-end-to-end, JOS-195).
  configureAssemblyTool();
  initTelemetry();
  installProcessErrorHandlers();
  startUpdateCheck(); // not awaited: the answer is read by GET /app/update, and listen is never delayed
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => void shutdownTelemetry().finally(() => process.exit(0)));
  }
  const app = await buildApp({ staticAssets: options.staticAssets });
  setVoiceOverLogger(app.log);
  setDecompositionLogger(app.log);
  const summary = recoverOnBoot();
  app.log.info(bootLogFields(summary), "boot recovery complete");
  app.log.info({ scheduledRetries: rebuildScheduler() }, "scheduled retries re-armed");
  // stage-execution-time-limit (JOS-185) Decision 8 — after resumption, so a result recovered at boot wins over a timeout.
  startAttemptTimeoutWatcher();
  await app.listen({ port: PORT, host: "127.0.0.1" });
  app.log.info(`listening on http://127.0.0.1:${PORT} (docs at /docs) — image concurrency limit ${concurrency.stats(STAGE).limit}, body limit ${BODY_LIMIT_BYTES} bytes`);
  return app;
}
