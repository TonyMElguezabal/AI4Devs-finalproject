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

const PORT = Number(process.env.PORT ?? 3100);
const STAGE_CONCURRENCY_LIMIT = Number(process.env.STAGE_CONCURRENCY_LIMIT ?? 2);

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
    openapi: { info: { title: "Vid4You backend", version: "0.0.0" } },
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
  const app = await buildApp();
  const summary = reconcileOnBoot();
  app.log.info(summary, "boot reconciliation complete");
  await app.listen({ port: PORT, host: "127.0.0.1" });
  app.log.info(`listening on http://127.0.0.1:${PORT} (docs at /docs) — stage concurrency limit ${STAGE_CONCURRENCY_LIMIT}, body limit ${BODY_LIMIT_BYTES} bytes`);
}
