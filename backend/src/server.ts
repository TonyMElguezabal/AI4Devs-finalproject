import { readFile } from "node:fs/promises";
import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { jsonSchemaTransform, serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";
import { routes } from "./routes.ts";
import { reconcileOnBoot, setAssemblyTool, VIDEO_STAGE } from "./orchestrator.ts";
import * as concurrency from "./concurrency.ts";
import { STAGE } from "./types.ts";
import { MAX_SIMULTANEOUS_REQUESTS } from "./config/providers.ts";
import { setVoiceOverLogger } from "./voiceOverPhase.ts";
import { rebuildScheduler } from "./retry/retryScheduler.ts";
import { startAttemptTimeoutWatcher } from "./retry/attemptTimeoutWatcher.ts";
import { setRetryDelayConfig } from "./retry/stageAttemptRecorder.ts";
import { createStubVoiceProvider as createStubVoice, setVoiceProviderRegistry, type StubVoiceProviderMode } from "./voiceProvider.ts";
import { setVideoProviderRegistry, createStubVideoProvider, STUB_VIDEO_PROVIDER_NAME, type StubVideoProviderMode } from "./videoProvider.ts";
import { createStubAssemblyTool } from "./stubAssemblyTool.ts";

const PORT = Number(process.env.PORT ?? 3100);
// define-provider-configuration (JOS-165) task 17.2 — this skeleton's one
// generic stage (STAGE = "image") maps to the real image stage's derived
// cap, replacing the walking skeleton's arbitrary placeholder (was 2).
const STAGE_CONCURRENCY_LIMIT = Number(process.env.STAGE_CONCURRENCY_LIMIT ?? MAX_SIMULTANEOUS_REQUESTS.image);

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

/** The boot log fields: the reconciliation summary plus each stage's in-flight count and limit. */
export function bootLogFields(summary: ReturnType<typeof reconcileOnBoot>) {
  const stageUsage = (stage: string) => {
    const { inFlight, limit } = concurrency.stats(stage);
    return { inFlight, limit };
  };
  return { ...summary, concurrency: { [STAGE]: stageUsage(STAGE), [VIDEO_STAGE]: stageUsage(VIDEO_STAGE) } };
}

// Bootstrap only when this file is run directly (`node src/server.ts`), not
// when imported by tests.
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  concurrency.setLimit(STAGE, STAGE_CONCURRENCY_LIMIT);
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
  if (stubVoiceMode) {
    setVoiceProviderRegistry({ defaultIdentifier: "stub-voice", adapters: { "stub-voice": createStubVoice(stubVoiceMode) } });
  }
  // USE_STUB_ASSEMBLY_TOOL=success|transient-failure|not-retryable-failure — manual endpoint testing only (JOS-149).
  const stubAssemblyMode = process.env.USE_STUB_ASSEMBLY_TOOL as string | undefined;
  if (stubAssemblyMode) {
    const mode = stubAssemblyMode === "success" ? { kind: "success" as const }
      : stubAssemblyMode === "not-retryable-failure" ? { kind: "not-retryable-failure" as const }
      : { kind: "transient-failure" as const };
    setAssemblyTool(createStubAssemblyTool(mode));
  }
  const app = await buildApp();
  setVoiceOverLogger(app.log);
  const summary = reconcileOnBoot();
  app.log.info(bootLogFields(summary), "boot reconciliation complete");
  app.log.info({ scheduledRetries: rebuildScheduler() }, "scheduled retries re-armed");
  // stage-execution-time-limit (JOS-185) Decision 8 — after resumption, so a result recovered at boot wins over a timeout.
  startAttemptTimeoutWatcher();
  await app.listen({ port: PORT, host: "127.0.0.1" });
  app.log.info(`listening on http://127.0.0.1:${PORT} (docs at /docs) — stage concurrency limit ${STAGE_CONCURRENCY_LIMIT}, body limit ${BODY_LIMIT_BYTES} bytes`);
}
