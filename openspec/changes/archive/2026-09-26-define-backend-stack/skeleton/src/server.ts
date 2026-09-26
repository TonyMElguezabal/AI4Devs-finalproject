import { readFile } from "node:fs/promises";
import Fastify from "fastify";
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

concurrency.setLimit(STAGE, STAGE_CONCURRENCY_LIMIT);

const app = Fastify({ logger: true });
app.setValidatorCompiler(validatorCompiler);
app.setSerializerCompiler(serializerCompiler);

// The frontend prototype (define-frontend-stack, JOS-180) runs on its own
// Vite dev server port; CORS lets it call this backend directly with no
// proxy config. Fine for a local single-user install (no auth layer, C9).
await app.register(cors, { origin: true });

await app.register(swagger, {
  openapi: { info: { title: "define-backend-stack skeleton", version: "0.0.0" } },
  transform: jsonSchemaTransform,
});
await app.register(swaggerUi, { routePrefix: "/docs" });

await app.register(routes);

app.get("/", async (_request, reply) => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  reply.type("text/html").send(html);
});

const summary = reconcileOnBoot();
app.log.info(summary, "boot reconciliation complete");

await app.listen({ port: PORT, host: "127.0.0.1" });
app.log.info(`skeleton listening on http://127.0.0.1:${PORT} (docs at /docs) — stage concurrency limit ${STAGE_CONCURRENCY_LIMIT}`);
