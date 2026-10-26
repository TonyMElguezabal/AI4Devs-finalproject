import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { jsonSchemaTransform, serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";
import { routes } from "./routes.ts";
import { allowedOrigins, registerOriginPolicy } from "./originPolicy.ts";
import { type recoverOnBoot, setAssemblyTool } from "./orchestrator.ts";
import { stagesWithoutRestartRecovery } from "./launchGate.ts";
import * as concurrency from "./concurrency.ts";
import { MAX_SIMULTANEOUS_REQUESTS } from "./config/providers.ts";
import { DB_PATH, getTelemetrySettings } from "./db.ts";
import { createAppLogger } from "./telemetry/logFile.ts";
import { dirname, join } from "node:path";
import { recordProductEvent, setConsent } from "./telemetry/index.ts";
import { createStubAssemblyTool, type StubAssemblyMode } from "./stubAssemblyTool.ts";
import { createFfmpegAssemblyTool } from "./ffmpegAssemblyTool.ts";
import type { AssemblyTool } from "./assemblyTool.ts";

export const PORT = Number(process.env.PORT ?? 3100);

// start-video-project (JOS-134) Decision 6 — impose no product-side script
// length limit; where an infrastructure ceiling remains, name the cause
// (Fastify's own 413 response) rather than leaving the framework default
// (1MB) in place, which would look identical to a product limit that PRD
// §4.1 says does not exist.
export const BODY_LIMIT_BYTES = Number(process.env.BODY_LIMIT_BYTES ?? 50 * 1024 * 1024);

/** An embedded interface file (package-executables-build, JOS-205): the packaged executable has no folder to serve from. */
export interface StaticAsset {
  contentType: string;
  body: Buffer;
}
/** Looks up the file for a request path such as `/assets/index.js`; `/` and `/admin` are the interface's own pages. */
export type StaticAssetReader = (path: string) => StaticAsset | undefined;

/**
 * Builds and configures the Fastify instance without binding a port, so
 * tests can drive it via `.inject()` (this story is the first with an HTTP
 * surface the skeleton's own tests never exercised — see
 * `test/session-creation.test.ts`). The real process bootstrap below is the
 * only caller that also calls `.listen()`.
 */
export async function buildApp(options: { logger?: FastifyBaseLogger; staticAssets?: StaticAssetReader } = {}): Promise<FastifyInstance> {
  // add-observability-telemetry (JOS-199) Decision 5 — stdout as before, plus a rotating file in `logs` beside the store.
  // Logging stays off under test, as before.
  // A caller may pass its own logger (a test does, to read what is logged); the default is unchanged.
  const loggerOptions: { loggerInstance?: FastifyBaseLogger; logger?: false } = options.logger
    ? { loggerInstance: options.logger }
    : process.env.NODE_ENV !== "test"
      ? { loggerInstance: createAppLogger({ dir: join(dirname(DB_PATH), "logs") }) }
      : { logger: false };
  const app = Fastify({ ...loggerOptions, bodyLimit: BODY_LIMIT_BYTES });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // The frontend (define-frontend-stack, JOS-180) runs on its own Vite dev server port; CORS lets it call this
  // backend directly with no proxy config. There is no auth layer (C9), so only the app's own origins are allowed
  // (originPolicy.ts); any other web page gets a 403 before a route runs.
  registerOriginPolicy(app, PORT);
  await app.register(cors, { origin: allowedOrigins(PORT) });

  await app.register(swagger, {
    openapi: {
      info: {
        title: "Vid4You API",
        version: "0.0.0",
        description:
          "Local, single-user API for turning a script into a narrated MP4 (Vid4You). Generated from the Fastify + Zod route schemas in backend/src/routes.ts (docs/backend-standards.md, API and OpenAPI Conventions) - never hand-written, to avoid drifting from the real validators.",
      },
      // protect-admin-with-password (JOS-173): every /admin/ endpoint takes the Administrator password as a bearer value.
      components: {
        securitySchemes: {
          administratorPassword: {
            type: "http",
            scheme: "bearer",
            description: "The Administrator password (ADMIN_PASSWORD in the local environment or secrets file).",
          },
        },
      },
    },
    // Applied here, not per route, so an Administrator route added later is documented as protected with no code of its own.
    transform: (args) => {
      const result = jsonSchemaTransform(args);
      if (!args.url.startsWith("/admin/")) return result;
      return { ...result, schema: { ...result.schema, security: [{ administratorPassword: [] }] } };
    },
  });
  await app.register(swaggerUi, { routePrefix: "/docs" });

  await app.register(routes);

  const staticAssets = options.staticAssets;
  if (staticAssets) {
    // Registered after the API routes, so those win; the origin policy hook above covers these answers too.
    app.get("/*", async (request, reply) => {
      const path = request.url.split("?")[0] ?? "/";
      const asset = staticAssets(path === "/admin" ? "/" : path);
      if (!asset) return reply.callNotFound();
      return reply.type(asset.contentType).send(asset.body);
    });
    app.get("/", async (_request, reply) => {
      const asset = staticAssets("/");
      if (!asset) return reply.callNotFound();
      return reply.type(asset.contentType).send(asset.body);
    });
  } else {
    app.get("/", async (_request, reply) => {
      const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
      reply.type("text/html").send(html);
    });
  }

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

// Bootstrap only when this file is run directly (`node src/server.ts`), not when imported by tests or bundled
// (argv[1] is absent or unrelated inside the packaged executable, where `import.meta.url` is empty).
const entryFile = process.argv[1];
if (entryFile !== undefined && import.meta.url === pathToFileURL(entryFile).href) {
  // No top-level await: the packaged bundle is CommonJS (package-executables-build, JOS-205). A failed start still exits non-zero.
  import("./bootstrap.ts").then(({ startServer }) => startServer()).catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
