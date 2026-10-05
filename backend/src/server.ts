import { readFile } from "node:fs/promises";
import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { jsonSchemaTransform, serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";
import { routes } from "./routes.ts";
import { reconcileOnBoot } from "./orchestrator.ts";
import * as concurrency from "./concurrency.ts";
import { STAGE } from "./types.ts";
import { MAX_SIMULTANEOUS_REQUESTS } from "./config/providers.ts";
import { setVoiceOverLogger } from "./voiceOverPhase.ts";
import { createStubVoiceProvider as createStubVoice, setVoiceProviderRegistry, type StubVoiceProviderMode } from "./voiceProvider.ts";
import { setVideoProviderRegistry, createStubVideoProvider, STUB_VIDEO_PROVIDER_NAME } from "./videoProvider.ts";

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

// Bootstrap only when this file is run directly (`node src/server.ts`), not
// when imported by tests.
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  concurrency.setLimit(STAGE, STAGE_CONCURRENCY_LIMIT);
  // USE_STUB_VIDEO_PROVIDER=success|transient-failure|not-retryable-failure — manual endpoint testing only.
  const stubVideoMode = process.env.USE_STUB_VIDEO_PROVIDER as string | undefined;
  if (stubVideoMode) {
    const bytes = Buffer.from("00000000667479706d703432", "hex"); // minimal ftyp mp4
    const stub = createStubVideoProvider(stubVideoMode as Parameters<typeof createStubVideoProvider>[0], { bytes });
    setVideoProviderRegistry({ defaultIdentifier: STUB_VIDEO_PROVIDER_NAME, adapters: { [STUB_VIDEO_PROVIDER_NAME]: stub } });
  }
  // USE_STUB_VOICE_PROVIDER=success|success-without-timestamps|transient-failure|not-retryable-failure|undecodable-audio|empty-audio|hang — manual endpoint testing only.
  const stubVoiceMode = process.env.USE_STUB_VOICE_PROVIDER as StubVoiceProviderMode | undefined;
  if (stubVoiceMode) {
    setVoiceProviderRegistry({ defaultIdentifier: "stub-voice", adapters: { "stub-voice": createStubVoice(stubVoiceMode) } });
  }
  const app = await buildApp();
  setVoiceOverLogger(app.log);
  const summary = reconcileOnBoot();
  app.log.info(summary, "boot reconciliation complete");
  await app.listen({ port: PORT, host: "127.0.0.1" });
  app.log.info(`listening on http://127.0.0.1:${PORT} (docs at /docs) — stage concurrency limit ${STAGE_CONCURRENCY_LIMIT}, body limit ${BODY_LIMIT_BYTES} bytes`);
}
