import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname } from "node:path";
import { launchVoiceOverFor } from "./voiceOverPhase.ts";
import { retryDecomposition } from "./decompositionRetry.ts";
import { randomUUID } from "node:crypto";
import {
  createRun,
  getRun,
  getSceneForRun,
  insertRegisteredScenes,
  commitSceneResult,
  markImageComplete,
  resolveArtefactPath,
  writeArtefactOnce,
  insertVoiceOver,
} from "./db.ts";
import {
  continueSession,
  correctAndRetry,
  events,
  handleProviderResult,
  launchVideoStage,
  manualRetry,
  pauseSession,
  toSnapshot,
} from "./orchestrator.ts";
import { PROVIDER_OUTCOME_MODES } from "./types.ts";
import { SUPPORTED_LANGUAGE_CODES, SUPPORTED_LANGUAGES } from "./config/providers.ts";
import { ulid } from "./util/ulid.ts";

/** Provisional — the real value is set by define-live-updates' idle experiment (Decision 7); this keeps the stream alive meanwhile. */
const HEARTBEAT_MS = 15_000;

const providerModeSchema = z.enum(PROVIDER_OUTCOME_MODES);

// start-video-project (JOS-134) Decision 1 — emptiness is judged on a
// trimmed view; the raw value is what gets stored (never the trimmed one).
const nonEmptyAfterTrim = (label: string) =>
  z.string().refine((v) => v.trim().length > 0, { message: `${label} must not be empty` });

// lock-script-and-narration (JOS-137) — the title, script and language are
// immutable from registration onward, enforced by the store (see db.ts) and
// stated in the generated API contract through these descriptions.
const createSessionBodySchema = z.object({
  title: nonEmptyAfterTrim("title").describe("Immutable once the session is registered (PRD §4.2)."),
  script: nonEmptyAfterTrim("script").describe(
    "Stored exactly as submitted and immutable from registration onward, in every state (PRD §4.2, D10). No operation modifies it.",
  ),
  // PRD §4.1, D09 — a session cannot start without a language selected from
  // the hardcoded supported list; refused regardless of how the request was
  // made (Decision 5). See config/providers.ts (define-provider-configuration, JOS-165) for the verified list.
  language: z.enum(SUPPORTED_LANGUAGE_CODES).describe("Immutable once the session is registered (PRD §4.1, §4.2)."),
});

// start-video-project (JOS-134) Decision 3 — session identifiers are ULIDs
// (opaque, creation-ordered), not UUIDs; scene and provider-request ids are
// unaffected (§12.3's "reached by identifier" guarantee is about sessions).
const ulidPattern = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
const sessionIdSchema = z.string().regex(ulidPattern, "invalid session identifier");

const IMAGE_CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

const sessionParamsSchema = z.object({ sessionId: sessionIdSchema });
const sceneParamsSchema = z.object({ sessionId: sessionIdSchema, sceneId: z.string().uuid() });
const providerCallbackParamsSchema = z.object({ requestId: z.string().uuid() });
const correctBodySchema = z.object({ instruction: z.string().min(1) });

// see-provider-and-attempts (JOS-166) Decision 4 — the closed list of what a stage diagnostic may carry. `.strict()` makes
// a field added by mistake fail validation, so nothing else of an attempt record can reach the page by default.
const stageDiagnosticSchema = z
  .object({
    stage: z.enum(["image", "video", "voice-over", "timestamps", "instructions", "assembly"]),
    provider: z.object({ name: z.string(), model: z.string().nullable() }).strict(),
    attempts: z.number().int().min(1).describe("Attempts recorded for this stage across every retry cycle, including one still in flight."),
  })
  .strict();

const sceneResponseSchema = z.object({
  type: z.literal("scene"),
  sessionId: z.string(),
  sceneId: z.string(),
  index: z.number(),
  state: z.string(),
  affectedStage: z.enum(["image", "video"]).optional(),
  errorCause: z.string().nullable().optional(),
  stages: z
    .object({ image: stageDiagnosticSchema.optional(), video: stageDiagnosticSchema.optional() })
    .strict()
    .describe("PRD §3: which provider each stage used and how many attempts it made. A key is present once that stage has at least one attempt. Derived from the stored attempt records, never stored."),
  result: z.object({ imageUrl: z.string().optional(), videoUrl: z.string().optional() }).optional(),
  instruction: z.string().optional(),
  prompt: z
    .string()
    .optional()
    .describe("PRD §3 PROMPT: the fragment of the script this chunk narrates. Immutable once the chunk is established (PRD §6)."),
  imageInstruction: z.string().optional().describe("PRD §3 IMAGE: the instruction to generate the chunk's image."),
  videoInstruction: z.string().optional().describe("PRD §3 VIDEO: the instruction to animate the chunk's image."),
  narrationInterval: z
    .object({ startSeconds: z.number(), endSeconds: z.number() })
    .optional()
    .describe(
      "PRD §3 and §7.3: the part of the voice-over this chunk narrates, in seconds. The intervals of a session's chunks are contiguous and cover the voice-over from 0 to its full duration. Read-only and immutable once the chunk is established; absent for a scene created without a decomposition.",
    ),
  requestedDurationSeconds: z
    .number()
    .optional()
    .describe(
      "PRD §7.2: the video provider's admitted clip duration requested for this chunk, chosen as the one needing the smallest speed change to match its narrated interval. Read-only and immutable once the chunk is established; absent for a scene created without a decomposition.",
    ),
  durationWarning: z
    .enum(["exceeds-maximum"])
    .optional()
    .describe(
      "PRD §6.1.1: set when the chunk's narrated interval is longer than the provider's largest admitted duration (an unsplittable sentence), so the requested duration had to be capped at that maximum. Not a failure. Read-only and immutable once the chunk is established.",
    ),
  speedFactor: z
    .number()
    .optional()
    .describe(
      "PRD §7.2/AC23: the speed-adjustment factor the requested duration implies (`max(requested/narrated, narrated/requested)`, always >= 1). Read-only and immutable once the chunk is established; absent for a scene created without a decomposition.",
    ),
  speedFactorWarning: z
    .enum(["exceeds-limit"])
    .optional()
    .describe(
      "PRD §7.2: set when the speed-adjustment factor exceeds the hardcoded acceptable limit. Not a failure, and independent of durationWarning. Read-only and immutable once the chunk is established.",
    ),
  held: z.boolean().optional().describe("True while the session is paused and this scene has pending work waiting to be launched."),
  updatedAt: z.string(),
});

const phaseResponseSchema = z.object({
  phase: z.enum(["voice-over", "decomposition", "scenes", "assembly"]),
  status: z
    .enum(["pending", "in-progress", "complete", "failed"])
    .describe("PRD §8.1, §8.3: derived from the session state on every read, never stored."),
  heldCount: z.number().int().describe("Work units a pause is holding for this phase; 0 when not paused."),
  stages: z
    .array(stageDiagnosticSchema)
    .describe("PRD §3: the session-level stages of this phase that have run, in pipeline order, each with its provider and attempt count. Empty for the scenes phase."),
  failure: z
    .object({ cause: z.string(), retryable: z.boolean() })
    .optional()
    .describe(
      "Present only on a failed voice-over, decomposition or assembly entry. Never carries the failure time, provider detail, credentials or the script. Scene failures are per scene, so the scenes entry has none.",
    ),
});

const sessionResponseSchema = z.object({
  type: z.literal("session"),
  sessionId: z.string(),
  title: z.string().describe("Immutable once the session is registered (PRD §4.2)."),
  script: z.string().describe(
    "The script exactly as submitted; immutable from registration onward, in every state (PRD §4.2, D10). No operation modifies it.",
  ),
  language: z.string().describe("Immutable once the session is registered (PRD §4.1, §4.2)."),
  state: z.string(),
  paused: z.boolean(),
  held: z.array(z.object({ stage: z.string(), count: z.number() })).describe("Stages with held work; empty when not paused."),
  failedPhase: z.string().optional(),
  failedSceneIndexes: z
    .array(z.number().int())
    .optional()
    .describe(
      "PRD §8.1: the indexes of the failed scenes, ascending. Present only when failedPhase is \"scenes\". Derived and read-only.",
    ),
  voiceOver: z
    .object({
      provider: z.string(),
      durationSeconds: z.number(),
      nativeTimestampsAvailable: z.boolean(),
      completedAt: z.string(),
    })
    .optional()
    .describe(
      "Present once the narration exists (PRD §5 step 2). Derived and read-only; the MP3 itself is never offered for download (PRD §12.3).",
    ),
  failure: z
    .object({
      phase: z.string(),
      cause: z.string(),
      retryable: z.boolean(),
      manualRetryAvailable: z
        .boolean()
        .describe("Whether the User can start a new cycle of up to four attempts. True only for a retryable failure whose cycle is exhausted."),
      cycle: z.number().int().min(1).describe("The cycle that ended in this failure, from 1."),
      attemptsInCycle: z.number().int().min(1).max(4).describe("Attempts the cycle held when it failed."),
      occurredAt: z.string(),
    })
    .optional()
    .describe("Present while the session is failed in a phase that records its failure (PRD §8.1); the cause is written for a person."),
  phases: z
    .array(phaseResponseSchema)
    .describe("PRD §8.3: always the four phases in pipeline order (voice-over, decomposition, scenes, assembly). Derived and read-only."),
  createdAt: z.string(),
  updatedAt: z.string(),
  finalVideoUrl: z.string().optional().describe("Route to download the assembled MP4; present only when state is final-video (JOS-149)."),
});

const languageResponseSchema = z.array(z.object({ code: z.string(), label: z.string() }));

const snapshotResponseSchema = z.object({
  session: sessionResponseSchema,
  scenes: z.array(sceneResponseSchema),
});

const okSchema = z.object({ ok: z.boolean() });
const conflictSchema = z.object({ ok: z.boolean(), reason: z.string() });
const retryAcceptedSchema = z.object({ ok: z.literal(true), held: z.boolean().describe("True while the session is paused: the retry is accepted and waits for continue.") });
const emptyBodySchema = z.object({}).strict().nullish();
// A malformed id is answered 404 by the handler, as the session read does, so it is not rejected by the schema.
const looseSessionParamsSchema = z.object({ sessionId: z.string() });

export const routes: FastifyPluginAsync = async (app) => {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get("/health", { schema: { response: { 200: z.object({ ok: z.boolean() }) } } }, async () => ({
    ok: true,
  }));

  // start-video-project (JOS-134) Decision 5 — the frontend fetches this
  // list rather than restating it; see config/providers.ts (JOS-165) for
  // the verified list and how it was derived.
  typed.get("/languages", { schema: { response: { 200: languageResponseSchema } } }, async () => [
    ...SUPPORTED_LANGUAGES,
  ]);

  // PRD §5 step 1, §8.1 — registers a session in `submitted` with zero
  // scenes: decomposition (US-07..US-09) hasn't run yet, so there is nothing
  // to launch and no provider is called here (Decision 8). The consultation
  // read and the resync snapshot are the same endpoint (consult-session,
  // JOS-135, Decision 1; define-live-updates, JOS-183, Decision 4).
  typed.post(
    "/sessions",
    {
      schema: {
        body: createSessionBodySchema,
        response: { 201: snapshotResponseSchema },
      },
    },
    async (request, reply) => {
      const sessionId = ulid();
      createRun(sessionId, request.body.title, request.body.script, request.body.language);
      reply.code(201);
      const snapshot = toSnapshot(sessionId);
      // generate-voice-over (JOS-136) Decision 1 — the session is committed; the
      // response above still says `submitted`, and the launch follows it.
      setImmediate(() => launchVoiceOverFor(sessionId));
      return snapshot;
    },
  );

  typed.get(
    "/sessions/:sessionId",
    {
      schema: {
        // consult-session (JOS-135) Decision 4 — unknown AND malformed
        // identifiers must look identical (both "not found"), so this
        // route deliberately does NOT use the strict `sessionIdSchema`
        // param validator (which would 400 a malformed id before this
        // handler ever runs, revealing "well-formed vs not" — exactly the
        // distinction Decision 4 says the store gains nothing from making).
        params: z.object({ sessionId: z.string() }),
        response: { 200: snapshotResponseSchema, 404: z.object({ error: z.string() }) },
      },
    },
    async (request, reply) => {
      const { sessionId } = request.params;
      const snapshot = ulidPattern.test(sessionId) ? toSnapshot(sessionId) : undefined;
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

  // retry-decomposition (JOS-156) — the manual retry of a failed decomposition (timestamps or division).
  typed.post(
    "/sessions/:sessionId/decomposition/retry",
    {
      schema: {
        params: looseSessionParamsSchema,
        body: emptyBodySchema,
        response: { 200: retryAcceptedSchema, 404: conflictSchema, 409: conflictSchema },
      },
    },
    async (request, reply) => {
      const { sessionId } = request.params;
      const result = ulidPattern.test(sessionId) ? retryDecomposition(sessionId) : ({ ok: false, reason: "session-not-found" } as const);
      if (result.ok) return result;
      reply.code(result.reason === "session-not-found" ? 404 : 409);
      return { ok: false, reason: result.reason };
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
        params: z.object({ sessionId: sessionIdSchema, sceneId: z.string().uuid(), kind: z.enum(["image", "video"]) }),
        response: { 200: z.string(), 409: conflictSchema, 404: conflictSchema },
      },
    },
    async (request, reply) => {
      // consult-session (JOS-135) Decision 2 — scoped by (sessionId,
      // sceneId) at the data-access boundary, not a manual check the
      // handler has to remember. This inline schema was also a real,
      // pre-existing bug from start-video-project: it validated `sessionId`
      // as a UUID, which rejects every real ULID session id with a 400
      // before the handler even runs — fixed here alongside the scoping.
      const scene = getSceneForRun(request.params.sessionId, request.params.sceneId);
      if (!scene) {
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

  // show-scene-results-and-actions (JOS-151), design Decisions 1-2 — views a
  // scene's stored image inline. Read-only; downloads (attachment semantics)
  // stay with the route above. Scoped by (session, scene), then confined to
  // the session's project folder by the same guard the writes use.
  typed.get(
    "/sessions/:sessionId/scenes/:sceneId/image",
    {
      schema: {
        params: z.object({ sessionId: sessionIdSchema, sceneId: z.string().uuid() }),
        response: { 200: z.any().describe("The image bytes (image/png or image/jpeg)"), 404: conflictSchema },
      },
    },
    async (request, reply) => {
      const notFound = (reason: string) => {
        reply.code(404);
        return { ok: false, reason };
      };
      const scene = getSceneForRun(request.params.sessionId, request.params.sceneId);
      if (!scene) return notFound("unknown scene");
      if (!scene.result) return notFound("scene has no stored image");
      const contentType = IMAGE_CONTENT_TYPES[extname(scene.result).toLowerCase()];
      if (!contentType) return notFound("scene has no stored image");
      const run = getRun(request.params.sessionId);
      if (!run) return notFound("unknown scene");
      let fullPath: string;
      try {
        fullPath = resolveArtefactPath(run.projectFolder, scene.result);
      } catch {
        return notFound("scene has no stored image");
      }
      if (!existsSync(fullPath) || !statSync(fullPath).isFile()) return notFound("scene has no stored image");
      reply.type(contentType);
      return reply.send(createReadStream(fullPath));
    },
  );

  // PRD §12.3 — the final MP4 is only available at `final-video`.
  typed.get(
    "/sessions/:sessionId/download/final-video",
    {
      schema: {
        params: sessionParamsSchema,
        response: { 200: z.any().describe("The assembled MP4 file (video/mp4)"), 409: conflictSchema, 404: conflictSchema },
      },
    },
    async (request, reply) => {
      const run = getRun(request.params.sessionId);
      if (!run) {
        reply.code(404);
        return { ok: false, reason: "unknown session" };
      }
      if (!run.finalVideoPath) {
        reply.code(409);
        return { ok: false, reason: "final video is not yet available" };
      }
      const fullPath = resolveArtefactPath(run.projectFolder, run.finalVideoPath);
      if (!existsSync(fullPath)) {
        reply.code(404);
        return { ok: false, reason: "final video file not found on disk" };
      }
      const { size } = statSync(fullPath);
      reply.header("Content-Disposition", `attachment; filename="final-video.mp4"`);
      reply.header("Content-Length", size);
      reply.type("video/mp4");
      return reply.send(createReadStream(fullPath));
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

  // Test-only endpoints for manual endpoint testing (task 9). Guarded by
  // ALLOW_TEST_ENDPOINTS env var; never available in production.
  if (process.env.ALLOW_TEST_ENDPOINTS) {
    typed.post(
      "/internal/test/quick-voice-over",
      {
        schema: {
          body: z.object({
            sessionId: z.string(),
            durationSeconds: z.number().positive(),
          }),
          response: {
            200: z.object({ ok: z.boolean() }),
            404: z.object({ error: z.string() }),
            409: z.object({ error: z.string() }),
          },
        },
      },
      async (request, reply) => {
        const { sessionId, durationSeconds } = request.body;
        const run = getRun(sessionId);
        if (!run) { reply.code(404); return { error: "session not found" }; }
        const audioPath = `voice-over.mp3`;
        writeArtefactOnce(run.projectFolder, audioPath, Buffer.alloc(0));
        const ok = insertVoiceOver({
          runId: sessionId,
          audioPath,
          timestampsPath: null,
          durationSeconds,
          sizeBytes: 0,
          nativeTimestampsAvailable: false,
          providerRequestId: null,
          completedAt: new Date().toISOString(),
        });
        if (!ok) { reply.code(409); return { error: "voice-over already exists" }; }
        return { ok: true };
      },
    );

    typed.post(
      "/internal/test/quick-scene",
      {
        schema: {
          body: z.object({
            sessionId: z.string(),
            sceneIndex: z.number().int().min(0).optional(),
            narrationStartSeconds: z.number().min(0).optional(),
            videoInstruction: z.string().min(1),
            requestedDurationSeconds: z.number().positive(),
            imageBytesBase64: z.string().optional(),
          }),
          response: {
            200: z.object({ sceneId: z.string() }),
            404: z.object({ error: z.string() }),
          },
        },
      },
      async (request, reply) => {
        const { sessionId, videoInstruction, requestedDurationSeconds, imageBytesBase64, sceneIndex, narrationStartSeconds } = request.body;
        const run = getRun(sessionId);
        if (!run) {
          reply.code(404);
          return { error: "session not found" };
        }
        const idx = sceneIndex ?? 0;
        const startSec = narrationStartSeconds ?? 0;
        const sceneId = randomUUID();
        const imagePath = `scene-${idx}.png`;
        // minimal 1×1 PNG bytes (overrideable for real-call tests)
        const pngBytes = imageBytesBase64
          ? Buffer.from(imageBytesBase64, "base64")
          : Buffer.from(
              "89504e470d0a1a0a0000000d49484452000000010000000108020000009001" +
              "2e00000000c4944415478016360f8cfc00000000200016700418000000025" +
              "8e32390000000049454e44ae426082",
              "hex",
            );
        insertRegisteredScenes(sessionId, [{
          id: sceneId,
          index: idx,
          prompt: videoInstruction,
          imageInstruction: videoInstruction,
          videoInstruction,
          narrationInterval: { startSeconds: startSec, endSeconds: startSec + requestedDurationSeconds },
          requestedDurationSeconds,
          durationWarning: null,
          speedFactor: 1,
          speedFactorWarning: null,
        }]);
        writeArtefactOnce(run.projectFolder, imagePath, pngBytes);
        commitSceneResult(sceneId, imagePath);
        markImageComplete(sceneId, imagePath);
        launchVideoStage(sceneId);
        return { sceneId };
      },
    );
  }
};
