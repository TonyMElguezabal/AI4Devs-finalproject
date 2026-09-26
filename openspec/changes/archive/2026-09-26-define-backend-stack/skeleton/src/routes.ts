import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createRun, createScene, getRun, getScene, getScenesForRun } from "./db.ts";
import {
  continueSession,
  correctAndRetry,
  events,
  handleProviderResult,
  launchScene,
  manualRetry,
  pauseSession,
  toSnapshot,
} from "./orchestrator.ts";
import { PROVIDER_OUTCOME_MODES } from "./types.ts";

/** Provisional — the real value is set by define-live-updates' idle experiment (Decision 7); this keeps the stream alive meanwhile. */
const HEARTBEAT_MS = 15_000;

const providerModeSchema = z.enum(PROVIDER_OUTCOME_MODES);

const createSessionBodySchema = z.object({
  title: z.string().min(1),
  // PRD §4.1 — a session cannot start without a language selected from the
  // hardcoded supported list. The real list is US-33's; this skeleton only
  // proves the field is required and recorded, not the concrete values.
  language: z.string().min(1),
  scenes: z
    .array(
      z.object({
        mode: providerModeSchema.default("success"),
        latencyMs: z.number().int().min(0).max(120_000).default(500),
        instruction: z.string().default(""),
      }),
    )
    .min(1),
});

const sessionParamsSchema = z.object({ sessionId: z.string().uuid() });
const sceneParamsSchema = z.object({ sessionId: z.string().uuid(), sceneId: z.string().uuid() });
const providerCallbackParamsSchema = z.object({ requestId: z.string().uuid() });
const correctBodySchema = z.object({ instruction: z.string().min(1) });

const sceneResponseSchema = z.object({
  type: z.literal("scene"),
  sessionId: z.string(),
  sceneId: z.string(),
  index: z.number(),
  state: z.string(),
  affectedStage: z.enum(["image", "video"]).optional(),
  errorCause: z.string().nullable().optional(),
  provider: z.string().optional(),
  attempts: z.number().optional(),
  result: z.object({ imageUrl: z.string().optional(), videoUrl: z.string().optional() }).optional(),
  instruction: z.string().optional(),
  updatedAt: z.string(),
});

const sessionResponseSchema = z.object({
  type: z.literal("session"),
  sessionId: z.string(),
  title: z.string(),
  language: z.string(),
  state: z.string(),
  paused: z.boolean(),
  failedPhase: z.string().optional(),
  updatedAt: z.string(),
});

const snapshotResponseSchema = z.object({
  session: sessionResponseSchema,
  scenes: z.array(sceneResponseSchema),
});

const okSchema = z.object({ ok: z.boolean() });
const conflictSchema = z.object({ ok: z.boolean(), reason: z.string() });

export const routes: FastifyPluginAsync = async (app) => {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get("/health", { schema: { response: { 200: z.object({ ok: z.boolean() }) } } }, async () => ({
    ok: true,
  }));

  // The consultation read and the resync snapshot are the same endpoint
  // (consult-session, JOS-135, Decision 1; define-live-updates, JOS-183, Decision 4).
  typed.post(
    "/sessions",
    {
      schema: {
        body: createSessionBodySchema,
        response: { 201: snapshotResponseSchema },
      },
    },
    async (request, reply) => {
      const sessionId = randomUUID();
      createRun(sessionId, request.body.title, request.body.language);
      request.body.scenes.forEach((sceneSpec, index) => {
        const sceneId = randomUUID();
        createScene(sceneId, sessionId, index + 1, sceneSpec.mode, sceneSpec.latencyMs, sceneSpec.instruction);
        launchScene(sceneId);
      });
      reply.code(201);
      return toSnapshot(sessionId);
    },
  );

  typed.get(
    "/sessions/:sessionId",
    {
      schema: {
        params: sessionParamsSchema,
        response: { 200: snapshotResponseSchema, 404: z.object({ error: z.string() }) },
      },
    },
    async (request, reply) => {
      const snapshot = toSnapshot(request.params.sessionId);
      if (!snapshot) {
        reply.code(404);
        return { error: "session not found" };
      }
      return snapshot;
    },
  );

  typed.post(
    "/sessions/:sessionId/pause",
    {
      schema: {
        params: sessionParamsSchema,
        response: { 200: okSchema, 404: conflictSchema },
      },
    },
    async (request, reply) => {
      const result = pauseSession(request.params.sessionId);
      if (!result.ok) {
        reply.code(404);
        return { ok: false, reason: result.reason ?? "unknown session" };
      }
      return { ok: true };
    },
  );

  typed.post(
    "/sessions/:sessionId/continue",
    {
      schema: {
        params: sessionParamsSchema,
        response: { 200: okSchema, 404: conflictSchema },
      },
    },
    async (request, reply) => {
      const result = continueSession(request.params.sessionId);
      if (!result.ok) {
        reply.code(404);
        return { ok: false, reason: result.reason ?? "unknown session" };
      }
      return { ok: true };
    },
  );

  typed.post(
    "/sessions/:sessionId/scenes/:sceneId/retry",
    {
      schema: {
        params: sceneParamsSchema,
        response: { 200: okSchema, 409: conflictSchema },
      },
    },
    async (request, reply) => {
      const result = manualRetry(request.params.sceneId);
      if (!result.ok) {
        reply.code(409);
        return { ok: false, reason: result.reason ?? "cannot retry" };
      }
      return { ok: true };
    },
  );

  // PRD §10.3 — the one visual-correction exception: offered only on a
  // failed stage, and only for the affected instruction.
  typed.post(
    "/sessions/:sessionId/scenes/:sceneId/correct",
    {
      schema: {
        params: sceneParamsSchema,
        body: correctBodySchema,
        response: { 200: okSchema, 409: conflictSchema },
      },
    },
    async (request, reply) => {
      const result = correctAndRetry(request.params.sceneId, request.body.instruction);
      if (!result.ok) {
        reply.code(409);
        return { ok: false, reason: result.reason ?? "cannot correct" };
      }
      return { ok: true };
    },
  );

  // PRD §12.3 — per-scene downloads while other scenes still process.
  // Simplification: this skeleton models one combined stage, so "image" and
  // "video" availability are not distinguished; both are available together
  // once the scene reaches `chunk-complete`. A real two-stage backend would
  // gate these independently.
  typed.get(
    "/sessions/:sessionId/scenes/:sceneId/download/:kind",
    {
      schema: {
        params: z.object({ sessionId: z.string().uuid(), sceneId: z.string().uuid(), kind: z.enum(["image", "video"]) }),
        response: { 200: z.string(), 409: conflictSchema, 404: conflictSchema },
      },
    },
    async (request, reply) => {
      const scene = getScene(request.params.sceneId);
      if (!scene || scene.runId !== request.params.sessionId) {
        reply.code(404);
        return { ok: false, reason: "unknown scene" };
      }
      if (scene.status !== "chunk-complete") {
        reply.code(409);
        return { ok: false, reason: `scene ${request.params.kind} is not available in status '${scene.status}'` };
      }
      reply.type("text/plain");
      return `stub ${request.params.kind} content for scene ${scene.index} (${scene.result})`;
    },
  );

  // PRD §12.3 — the final MP4 is only available at `final-video`.
  typed.get(
    "/sessions/:sessionId/download/final-video",
    {
      schema: {
        params: sessionParamsSchema,
        response: { 200: z.string(), 409: conflictSchema, 404: conflictSchema },
      },
    },
    async (request, reply) => {
      const snapshot = toSnapshot(request.params.sessionId);
      if (!snapshot) {
        reply.code(404);
        return { ok: false, reason: "unknown session" };
      }
      if (snapshot.session.state !== "final-video") {
        reply.code(409);
        return { ok: false, reason: `final video is not available in state '${snapshot.session.state}'` };
      }
      reply.type("text/plain");
      return `stub final MP4 content for session ${request.params.sessionId}`;
    },
  );

  // Simulates a provider webhook delivering a result. Also used directly (by
  // curl or the automated test) to send a *duplicate* delivery, proving C7.
  typed.post(
    "/internal/provider-callback/:requestId",
    {
      schema: {
        params: providerCallbackParamsSchema,
        response: { 200: z.object({ applied: z.boolean(), note: z.string() }) },
      },
    },
    async (request) => {
      return handleProviderResult(request.params.requestId);
    },
  );

  // Live push (SSE) — proves C8. Emits the full session snapshot whenever it
  // changes, without the client reloading, plus a periodic heartbeat so an
  // idle connection is distinguishable from a dead one (Decision 7).
  app.get("/events", async (request, reply) => {
    const sessionId = (request.query as { sessionId?: string }).sessionId;

    // define-live-updates (JOS-183) task 10.7 — a request for an unknown
    // session is rejected, not silently opened as an empty stream that would
    // never emit anything (found while writing the mandatory curl transcript).
    if (!sessionId || !getRun(sessionId)) {
      reply.code(404).send({ error: "session not found" });
      return;
    }

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      // Writing to `reply.raw` bypasses Fastify's reply pipeline entirely,
      // so the @fastify/cors plugin's onSend hook never runs for this route
      // — found by the frontend prototype's browser actually refusing the
      // response with no CORS header. Set it explicitly here instead.
      "Access-Control-Allow-Origin": request.headers.origin ?? "*",
    });
    reply.raw.write(": connected\n\n");

    const onState = (payload: { session: { sessionId: string } }) => {
      if (sessionId && payload.session.sessionId !== sessionId) return;
      reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
    };
    events.on("state", onState);

    const heartbeat = setInterval(() => {
      reply.raw.write(": heartbeat\n\n");
    }, HEARTBEAT_MS);
    heartbeat.unref();

    request.raw.on("close", () => {
      events.off("state", onState);
      clearInterval(heartbeat);
    });
  });
};
