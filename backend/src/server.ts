import { readFile } from "node:fs/promises";
import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { jsonSchemaTransform, serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";
import { routes } from "./routes.ts";
import { recoverOnBoot, setAssemblyTool } from "./orchestrator.ts";
import { stagesWithoutRestartRecovery } from "./launchGate.ts";
import * as concurrency from "./concurrency.ts";
import { MAX_SIMULTANEOUS_REQUESTS } from "./config/providers.ts";
import { STAGE } from "./types.ts";
import { setDecompositionLogger } from "./decompositionPhase.ts";
import { setVoiceOverLogger } from "./voiceOverPhase.ts";
import { getTelemetrySettings } from "./db.ts";
import { recordProductEvent, setConsent, shutdownTelemetry } from "./telemetry/index.ts";
import { installProcessErrorHandlers } from "./telemetry/processHandlers.ts";
import { rebuildScheduler } from "./retry/retryScheduler.ts";
import { startAttemptTimeoutWatcher } from "./retry/attemptTimeoutWatcher.ts";
import { setRetryDelayConfig } from "./retry/stageAttemptRecorder.ts";
import { createStubVoiceProvider as createStubVoice, setVoiceProviderRegistry, type StubVoiceProviderMode } from "./voiceProvider.ts";
import { setVideoProviderRegistry, createStubVideoProvider, STUB_VIDEO_PROVIDER_NAME, type StubVideoProviderMode } from "./videoProvider.ts";
import { createStubAssemblyTool, type StubAssemblyMode } from "./stubAssemblyTool.ts";
import { createFfmpegAssemblyTool } from "./ffmpegAssemblyTool.ts";
import type { AssemblyTool } from "./assemblyTool.ts";

const PORT = Number(process.env.PORT ?? 3100);
// The caps come from MAX_SIMULTANEOUS_REQUESTS (JOS-167); this override exists
// for manual testing, where a small image cap makes queueing visible.
const STAGE_CONCURRENCY_OVERRIDE = process.env.STAGE_CONCURRENCY_LIMIT;

// start-video-project (JOS-134) Decision 6 — impose no product-side script
// length limit; where an infrastructure ceiling remains, name the cause
// (Fastify's own 413 response) rather than leaving the framework default
// (1MB) in place, which would look identical to a product limit that PRD
// §4.1 says does not exist.
const BODY_LIMIT_BYTES = Number(process.env.BODY_LIMIT_BYTES ?? 50 * 1024 * 1024);

/**
 * Builds and configures the Fastify instance without binding a port, so
 * tests can drive it via `.inject()` (this story is the first with an HTTP
 * surface the skeleton's own tests never exercised — see
 * `test/session-creation.test.ts`). The real process bootstrap below is the
 * only caller that also calls `.listen()`.
 */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: process.env.NODE_ENV !== "test", bodyLimit: BODY_LIMIT_BYTES });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // The frontend (define-frontend-stack, JOS-180) runs on its own Vite dev
  // server port; CORS lets it call this backend directly with no proxy
  // config. Fine for a local single-user install (no auth layer, C9).
  await app.register(cors, { origin: true });

  await app.register(swagger, {
    openapi: {
      info: {
        title: "Vid4You API",
        version: "0.0.0",
        description:
          "Local, single-user API for turning a script into a narrated MP4 (Vid4You). Generated from the Fastify + Zod route schemas in backend/src/routes.ts (docs/backend-standards.md, API and OpenAPI Conventions) - never hand-written, to avoid drifting from the real validators.",
      },
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: "/docs" });

  await app.register(routes);

  app.get("/", async (_request, reply) => {
    const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
    reply.type("text/html").send(html);
  });

  return app;
}

/** add-observability-telemetry (JOS-199) — load the stored consent, then count the start. Everything stays off until the user opts in. */
export function initTelemetry(): void {
  setConsent(getTelemetrySettings());
  recordProductEvent("app_start");
}

/** The boot log fields: the settle summary, each stage's in-flight count and limit, and the stages with no restart recovery. */
export function bootLogFields(summary: ReturnType<typeof recoverOnBoot>) {
  const stageUsage = (stage: string) => {
    const { inFlight, limit } = concurrency.stats(stage);
    return { inFlight, limit };
  };
  return {
    ...summary,
    concurrency: Object.fromEntries(Object.keys(MAX_SIMULTANEOUS_REQUESTS).map((stage) => [stage, stageUsage(stage)])),
    noRestartRecovery: stagesWithoutRestartRecovery(),
  };
}

/** The manual-testing assembly stub for a `USE_STUB_ASSEMBLY_TOOL` value (JOS-149, JOS-161). Unknown values fall back to a transient failure. */
export function assemblyStubModeFor(name: string, delayMsValue: string | undefined): StubAssemblyMode {
  if (name === "success") return { kind: "success" };
  if (name === "not-retryable-failure") return { kind: "not-retryable-failure" };
  if (name === "slow-success") return { kind: "slow-success", delayMs: Number(delayMsValue ?? 15000) };
  return { kind: "transient-failure" };
}

/**
 * run-session-end-to-end (JOS-195), design Decision 5 — the assembly tool the running application uses: the ffmpeg
 * adapter by default, or the stub a `USE_STUB_ASSEMBLY_TOOL` value names (manual testing only). Registering it here,
 * rather than inline in the bootstrap, lets a test reach it; without it every session fails at assembly with
 * "no assembly tool is configured".
 */
export function configureAssemblyTool(
  env: Record<string, string | undefined> = process.env,
  factories: { ffmpeg: () => AssemblyTool; stub: (mode: StubAssemblyMode) => AssemblyTool } = {
    ffmpeg: createFfmpegAssemblyTool,
    stub: createStubAssemblyTool,
  },
): AssemblyTool {
  const stubMode = env.USE_STUB_ASSEMBLY_TOOL;
  const tool = stubMode ? factories.stub(assemblyStubModeFor(stubMode, env.ASSEMBLY_STUB_DELAY_MS)) : factories.ffmpeg();
  setAssemblyTool(tool);
  return tool;
}

// Bootstrap only when this file is run directly (`node src/server.ts`), not
// when imported by tests.
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  if (STAGE_CONCURRENCY_OVERRIDE) concurrency.setLimit(STAGE, Number(STAGE_CONCURRENCY_OVERRIDE));
  // USE_STUB_VIDEO_PROVIDER=success|success-bytes|pending|request-lost|transient-failure|not-retryable-failure — manual endpoint testing only.
  // `pending` leaves every clip unfinished, so a restart can be watched resuming it; `success` is an alias of `success-bytes`.
  const stubVideoMode = process.env.USE_STUB_VIDEO_PROVIDER as string | undefined;
  if (stubVideoMode) {
    const bytes = Buffer.from("00000000667479706d703432", "hex"); // minimal ftyp mp4
    const resolvedMode: StubVideoProviderMode = stubVideoMode === "success" ? "success-bytes"
      : (["success-bytes", "pending", "request-lost", "not-retryable-failure"] as const).find((m) => m === stubVideoMode) ?? "transient-failure";
    const stub = createStubVideoProvider(resolvedMode, { bytes });
    setVideoProviderRegistry({ defaultIdentifier: STUB_VIDEO_PROVIDER_NAME, adapters: { [STUB_VIDEO_PROVIDER_NAME]: stub } });
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
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => void shutdownTelemetry().finally(() => process.exit(0)));
  }
  const app = await buildApp();
  setVoiceOverLogger(app.log);
  setDecompositionLogger(app.log);
  const summary = recoverOnBoot();
  app.log.info(bootLogFields(summary), "boot recovery complete");
  app.log.info({ scheduledRetries: rebuildScheduler() }, "scheduled retries re-armed");
  // stage-execution-time-limit (JOS-185) Decision 8 — after resumption, so a result recovered at boot wins over a timeout.
  startAttemptTimeoutWatcher();
  await app.listen({ port: PORT, host: "127.0.0.1" });
  app.log.info(`listening on http://127.0.0.1:${PORT} (docs at /docs) — image concurrency limit ${concurrency.stats(STAGE).limit}, body limit ${BODY_LIMIT_BYTES} bytes`);
}
