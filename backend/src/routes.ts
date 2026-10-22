import type { FastifyPluginAsync } from "fastify";
import { recordProductEvent, setConsent } from "./telemetry/index.ts";
import { getUpdateResult } from "./telemetry/updateCheck.ts";
import { z } from "zod";
import { jsonSchemaTransform, type ZodTypeProvider } from "fastify-type-provider-zod";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname } from "node:path";
import { getScriptModerator } from "./scriptModeration.ts";
import { launchVoiceOverFor } from "./voiceOverPhase.ts";
import { retryDecomposition } from "./decompositionRetry.ts";
import { adminSettingsImageRoutes } from "./adminSettingsRoutes.ts";
import { appSettingsResponseSchema, visualStylePromptBodySchema } from "./adminSettingsSchemas.ts";
import { retryAssembly } from "./assemblyRetry.ts";
import { retryVoiceOver } from "./voiceOverRetry.ts";
import { rebuildFinalVideo } from "./finalVideoRebuild.ts";
import { setScenePause } from "./scenePauseEdit.ts";
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
  getTelemetrySettings,
  getAppSettings,
  saveVisualStylePrompt,
  saveTelemetryConsent,
  type TelemetrySettings,
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
import { SUPPORTED_LANGUAGE_CODES, SUPPORTED_LANGUAGES } from "./config/providers.ts";
import { ulid } from "./util/ulid.ts";
import { adminDeniedSchema, registerAdminGate } from "./adminAccess.ts";
import { PROVIDER_STAGES, providerView, selectableProviders, setActiveProvider } from "./activeProvider.ts";
import { registerFailedStageRoutes } from "./adminFailedStageRoutes.ts";
import { registerProviderProfileRoutes } from "./adminProviderRoutes.ts";
import { profileProblems } from "./providerAdmin.ts";
import { getProfile } from "./providerProfiles.ts";
import { contentDisposition, downloadFilename } from "./util/downloadFilename.ts";

/** Provisional — the real value is set by define-live-updates' idle experiment (Decision 7); this keeps the stream alive meanwhile. */
const HEARTBEAT_MS = 15_000;

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
  // the configured supported list; refused regardless of how the request was
  // made (Decision 5). The list comes from the settings files
  // (configure-providers-and-parameters, JOS-174), whose schema requires at least one language,
  // so the cast to a non-empty tuple holds.
  language: z.enum(SUPPORTED_LANGUAGE_CODES as readonly [string, ...string[]]).describe("Immutable once the session is registered (PRD §4.1, §4.2). One of the configured supported languages (`GET /languages`); English and Spanish by default."),
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

/**
 * download-final-video (JOS-164), design Decision 1 — `fastify-type-provider-zod`'s
 * response schemas convert to JSON Schema only, so a zod schema can never produce
 * `content: { "video/mp4": ... }` in the generated contract (confirmed by reading
 * `fastify-type-provider-zod` and `@fastify/swagger`'s source: a zod response always
 * resolves to a `application/json` media type). `@fastify/swagger` does support a
 * route-level `config.swaggerTransform` override, applied in place of the global
 * `transform` for that one route — used here to replace only the 200 entry's
 * documentation with the real binary content type, after letting the normal zod
 * transform produce every other status code. The route's runtime schema (and
 * therefore its actual response) is unchanged; this affects only `/docs/json`.
 */
function binaryFileSwaggerTransform(contentType: string, description: string) {
  return ({ schema, url }: Parameters<typeof jsonSchemaTransform>[0]) => {
    const { schema: transformedSchema, url: transformedUrl } = jsonSchemaTransform({ schema, url });
    const transformed = transformedSchema as { response: Record<string, unknown> };
    transformed.response["200"] = {
      description,
      content: { [contentType]: { schema: { type: "string", format: "binary" } } },
    };
    return { schema: transformed, url: transformedUrl };
  };
}

const sessionParamsSchema = z.object({ sessionId: sessionIdSchema });
const sceneParamsSchema = z.object({ sessionId: sessionIdSchema, sceneId: z.string().uuid() });
const providerCallbackParamsSchema = z.object({ requestId: z.string().uuid() });
// retry-or-correct-image (JOS-157), design Decision 5 — trimmed, non-blank. Not `.strict()`: this endpoint
// follows the same "an operation that accepts a body ignores locked fields" convention every other
// chunk-mutating route in this project uses (consult-session AC1) — an extra field in the body is read nowhere
// and so changes nothing, the same guarantee `.strict()` would give, without breaking that shared convention.
const correctBodySchema = z.object({ instruction: z.string().transform((value) => value.trim()).pipe(z.string().min(1)) });

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
  downloads: z
    .object({ imageUrl: z.string().optional(), clipUrl: z.string().optional() })
    .optional()
    .describe("download-scene-results (JOS-163): present only for the files that actually exist. The page offers a download link for exactly these."),
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
  pause: z
    .object({
      originalSeconds: z.number().describe("The silence after this scene in the narration as generated: its interval's end minus the end of its last spoken character."),
      seconds: z.number().describe("The pause the User has set; equals originalSeconds when unchanged."),
      minSeconds: z.number().describe("The least the pause may be: the 0.2 s floor, raised when a shorter pause would speed this scene's clip past the speed-factor limit."),
      maxSeconds: z.number().describe("The most the pause may be: the 3.0 s cap, lowered when a longer pause would slow this scene's clip past the speed-factor limit."),
      limitedBySpeedFactor: z.boolean().describe("True when the speed-factor limit, not the floor or the cap, set either bound."),
    })
    .optional()
    .describe(
      "adjust-scene-pause (JOS-190): the dial for the silence after this scene. Present only once the session has a final video and this scene's pause can be derived. Derived on every read; the stored interval is never changed.",
    ),
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
  running: z
    .array(z.object({ stage: z.string(), count: z.number() }))
    .describe("Stages with work actually in flight, computed whether or not the session is paused (JOS-153)."),
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
  finalVideo: z
    .object({
      version: z.number().int().min(1).describe("1 for the original final-video.mp4; 2 onwards for each rebuild. finalVideoUrl always serves this version."),
      pendingPauseEdits: z.boolean().describe("True when the User's pause edits differ from those this version was built with, so a rebuild would change it."),
      rebuildFailure: z
        .object({ cause: z.string() })
        .optional()
        .describe("Present only while the latest rebuild attempt ended in failure. The current version is kept and a rebuild can be requested again."),
    })
    .optional()
    .describe("adjust-scene-pause (JOS-190): present once the session has a final video. Derived on every read, never stored."),
});

const languageResponseSchema = z.array(z.object({ code: z.string(), label: z.string() }));

const snapshotResponseSchema = z.object({
  session: sessionResponseSchema,
  scenes: z.array(sceneResponseSchema),
});

const okSchema = z.object({ ok: z.boolean() });
const conflictSchema = z.object({ ok: z.boolean(), reason: z.string() });
const retryAcceptedSchema = z.object({ ok: z.literal(true), held: z.boolean().describe("True while the session is paused: the retry is accepted and waits for continue.") });
// add-observability-telemetry (JOS-199) — the install ID stays in the store and is never returned.
const telemetryConsentBodySchema = z.object({ errors: z.boolean(), providerUsage: z.boolean(), productUsage: z.boolean() }).strict();
const telemetryConsentResponseSchema = telemetryConsentBodySchema.extend({ answered: z.boolean() });
function consentView({ errors, providerUsage, productUsage, answered }: TelemetrySettings) {
  return { errors, providerUsage, productUsage, answered };
}
const appUpdateResponseSchema = z.union([
  z.object({ available: z.literal(false) }),
  z.object({ available: z.literal(true), tag: z.string(), url: z.string() }),
]);
const emptyBodySchema = z.object({}).strict().nullish();
// adjust-scene-pause (JOS-190) — a number only; whether it is on the 0.1 s grid and inside the scene's range depends on
// the scene, so it is answered 422 with a sentence by the handler rather than rejected by the schema.
const pauseBodySchema = z.object({ seconds: z.number().finite().min(0) });
// A malformed id is answered 404 by the handler, as the session read does, so it is not rejected by the schema.
const looseSessionParamsSchema = z.object({ sessionId: z.string() });

const providerViewSchema = z.object({
  stage: z.enum(PROVIDER_STAGES),
  activeProviderId: z.string(),
  activeLabel: z.string(),
  source: z.enum(["settings", "admin"]),
  selectable: z.array(z.object({ id: z.string(), label: z.string() })),
  orphanedChoice: z.string().nullable(),
});

export const routes: FastifyPluginAsync = async (app) => {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  // eslint-disable-next-line @typescript-eslint/require-await -- a Fastify handler is async by contract, so a throw becomes a rejected reply
  typed.get("/health", { schema: { response: { 200: z.object({ ok: z.boolean() }) } } }, async () => ({
    ok: true,
  }));

  // start-video-project (JOS-134) Decision 5 — the frontend fetches this
  // list rather than restating it; see config/providers.ts (JOS-165) for
  // the verified list and how it was derived.
  typed.get(
    "/telemetry/consent",
    { schema: { response: { 200: telemetryConsentResponseSchema } } },
    // eslint-disable-next-line @typescript-eslint/require-await -- a Fastify handler is async by contract, so a throw becomes a rejected reply
    async () => consentView(getTelemetrySettings()),
  );

  typed.put(
    "/telemetry/consent",
    { schema: { body: telemetryConsentBodySchema, response: { 200: telemetryConsentResponseSchema } } },
    // eslint-disable-next-line @typescript-eslint/require-await -- a Fastify handler is async by contract, so a throw becomes a rejected reply
    async (request) => {
      const saved = saveTelemetryConsent(request.body);
      setConsent(saved); // applies at once, without a restart (spec: Per-signal opt-in consent)
      return consentView(saved);
    },
  );

  typed.get("/app/update", { schema: { response: { 200: appUpdateResponseSchema } } }, async () => getUpdateResult());

  // eslint-disable-next-line @typescript-eslint/require-await -- a Fastify handler is async by contract, so a throw becomes a rejected reply
  typed.get("/languages", { schema: { response: { 200: languageResponseSchema } } }, async () => [
    ...SUPPORTED_LANGUAGES,
  ]);

  // PRD §5 step 1, §8.1 — registers a session in `submitted` with zero
  // scenes: decomposition (US-07..US-09) hasn't run yet, so there is nothing
  // to launch and no provider is called here (Decision 8). The consultation
  // read and the resync snapshot are the same endpoint (consult-session,
  // JOS-135, Decision 1; define-live-updates, JOS-183, Decision 4).
  // moderate-script-at-submission (JOS-187): the script is checked by the
  // reasoning provider's moderation endpoint first. Flagged → 422, no verdict →
  // 503, and nothing is created in either case.
  typed.post(
    "/sessions",
    {
      schema: {
        body: createSessionBodySchema,
        response: { 201: snapshotResponseSchema, 422: conflictSchema, 503: conflictSchema },
      },
    },
    async (request, reply) => {
      const verdict = await getScriptModerator().moderate(request.body.script);
      if (verdict.kind === "flagged") {
        reply.code(422);
        return {
          ok: false,
          reason: `The script was refused by the provider's content policy (flagged: ${verdict.categories.join(", ")}). Edit the script and submit it again.`,
        };
      }
      if (verdict.kind === "unavailable") {
        reply.code(503);
        return { ok: false, reason: "The content check is temporarily unavailable. Submit the script again in a moment." };
      }
      const sessionId = ulid();
      createRun(sessionId, request.body.title, request.body.script, request.body.language);
      recordProductEvent("session_started");
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

  // retry-voice-over (JOS-155) — the manual retry of a failed voice-over. Same script and provider, nothing deleted;
  // the body is strictly empty so no input can change what is sent.
  typed.post(
    "/sessions/:sessionId/voice-over/retry",
    {
      schema: {
        params: looseSessionParamsSchema,
        body: emptyBodySchema,
        response: { 200: retryAcceptedSchema, 404: conflictSchema, 409: conflictSchema },
      },
    },
    async (request, reply) => {
      const { sessionId } = request.params;
      const result = ulidPattern.test(sessionId) ? retryVoiceOver(sessionId) : ({ ok: false, reason: "session-not-found" } as const);
      if (result.ok) return result;
      reply.code(result.reason === "session-not-found" ? 404 : 409);
      return { ok: false, reason: result.reason };
    },
  );

  // retry-final-assembly (JOS-159) — the manual retry of a failed final assembly. Design Decision 7 — assembly
  // always offers a retry, whatever `retryable` is, so there is no `not-retryable` 409 reason here.
  typed.post(
    "/sessions/:sessionId/assembly/retry",
    {
      schema: {
        params: looseSessionParamsSchema,
        body: emptyBodySchema,
        response: { 200: retryAcceptedSchema, 404: conflictSchema, 409: conflictSchema },
      },
    },
    async (request, reply) => {
      const { sessionId } = request.params;
      const result = ulidPattern.test(sessionId) ? retryAssembly(sessionId) : ({ ok: false, reason: "session-not-found" } as const);
      if (result.ok) return result;
      reply.code(result.reason === "session-not-found" ? 404 : 409);
      return { ok: false, reason: result.reason };
    },
  );

  // adjust-scene-pause (JOS-190), design Decision 9 — the dial for the silence after one scene. A POST like every other
  // mutation here (the content-lock tests pin that the API has no PUT, PATCH or DELETE). Only while the session has a
  // final video and nothing is assembling; a value off the 0.1 s grid or outside the scene's range answers 422 with a sentence.
  typed.post(
    "/sessions/:sessionId/scenes/:sceneId/pause",
    {
      schema: {
        params: looseSessionParamsSchema.extend({ sceneId: z.string() }),
        body: pauseBodySchema,
        response: { 200: sceneResponseSchema, 404: conflictSchema, 409: conflictSchema, 422: conflictSchema },
      },
    },
    async (request, reply) => {
      const { sessionId, sceneId } = request.params;
      const result = ulidPattern.test(sessionId)
        ? setScenePause(sessionId, sceneId, request.body.seconds)
        : ({ ok: false, reason: "session-not-found" } as const);
      if (result.ok) {
        const scene = toSnapshot(sessionId)?.scenes.find((candidate) => candidate.sceneId === sceneId);
        return scene;
      }
      if (result.reason === "out-of-range") {
        reply.code(422);
        return { ok: false, reason: result.message };
      }
      reply.code(result.reason === "session-not-found" || result.reason === "unknown-scene" ? 404 : 409);
      return { ok: false, reason: result.reason };
    },
  );

  // adjust-scene-pause (JOS-190), design Decision 6 — assemble a new version of the final video with the stored pause
  // edits. 202: the work happens after the answer, like every assembly.
  typed.post(
    "/sessions/:sessionId/final-video/rebuild",
    {
      schema: {
        params: looseSessionParamsSchema,
        body: emptyBodySchema,
        response: { 202: retryAcceptedSchema, 404: conflictSchema, 409: conflictSchema },
      },
    },
    async (request, reply) => {
      const { sessionId } = request.params;
      const result = ulidPattern.test(sessionId) ? rebuildFinalVideo(sessionId) : ({ ok: false, reason: "session-not-found" } as const);
      if (result.ok) {
        reply.code(202);
        return result;
      }
      reply.code(result.reason === "session-not-found" ? 404 : 409);
      return { ok: false, reason: result.reason };
    },
  );

  // retry-or-correct-image (JOS-157) / retry-or-correct-clip (JOS-158) — scoped by (sessionId, sceneId);
  // the orchestrator dispatches by the stored failed stage. Unknown/cross-session scenes all answer 404 as `unknown-scene`.
  typed.post(
    "/sessions/:sessionId/scenes/:sceneId/retry",
    {
      schema: {
        params: sceneParamsSchema,
        response: { 200: okSchema, 404: conflictSchema, 409: conflictSchema },
      },
    },
    async (request, reply) => {
      const result = manualRetry(request.params.sessionId, request.params.sceneId);
      if (!result.ok) {
        reply.code(result.reason === "unknown-scene" ? 404 : 409);
        return { ok: false, reason: result.reason };
      }
      return { ok: true };
    },
  );

  // PRD §10.3 — the one visual-correction exception: the orchestrator dispatches this shared route
  // to IMAGE or VIDEO according to the persisted failed stage, and changes only that instruction.
  typed.post(
    "/sessions/:sessionId/scenes/:sceneId/correct",
    {
      schema: {
        params: sceneParamsSchema,
        body: correctBodySchema,
        response: { 200: okSchema, 404: conflictSchema, 409: conflictSchema },
      },
    },
    async (request, reply) => {
      const result = correctAndRetry(request.params.sessionId, request.params.sceneId, request.body.instruction);
      if (!result.ok) {
        reply.code(result.reason === "unknown-scene" ? 404 : 409);
        return { ok: false, reason: result.reason };
      }
      return { ok: true };
    },
  );

  // download-scene-results (JOS-163), design Decisions 1-2, 4 — availability
  // is "the file exists" (`scenes.result` for image, `scenes.video_result`
  // for video), not a scene state, so each is downloadable independently of
  // the other and of every other scene's state (AC1-AC3). `kind` stays
  // `image | video` — `voice-over`/`timestamps`/`texts` answer 400 by
  // construction (AC4, §12.3).
  typed.get(
    "/sessions/:sessionId/scenes/:sceneId/download/:kind",
    {
      schema: {
        params: z.object({ sessionId: sessionIdSchema, sceneId: z.string().uuid(), kind: z.enum(["image", "video"]) }),
        response: { 200: z.any().describe("The stored file (image/png, image/jpeg or video/mp4)"), 409: conflictSchema, 404: conflictSchema },
      },
    },
    async (request, reply) => {
      // consult-session (JOS-135) Decision 2 — scoped by (sessionId,
      // sceneId) at the data-access boundary, not a manual check the
      // handler has to remember.
      const { kind } = request.params;
      const scene = getSceneForRun(request.params.sessionId, request.params.sceneId);
      if (!scene) {
        reply.code(404);
        return { ok: false, reason: "unknown scene" };
      }
      const storedPath = kind === "image" ? scene.result : scene.videoResult;
      if (!storedPath) {
        reply.code(409);
        return { ok: false, reason: `scene ${kind} is not available yet` };
      }
      const contentType = kind === "video" ? "video/mp4" : IMAGE_CONTENT_TYPES[extname(storedPath).toLowerCase()];
      if (!contentType) {
        reply.code(404);
        return { ok: false, reason: `scene has no stored ${kind}` };
      }
      const run = getRun(request.params.sessionId);
      if (!run) {
        reply.code(404);
        return { ok: false, reason: "unknown scene" };
      }
      let fullPath: string;
      try {
        fullPath = resolveArtefactPath(run.projectFolder, storedPath);
      } catch {
        reply.code(404);
        return { ok: false, reason: `scene has no stored ${kind}` };
      }
      if (!existsSync(fullPath) || !statSync(fullPath).isFile()) {
        reply.code(404);
        return { ok: false, reason: `scene has no stored ${kind}` };
      }
      const filename = kind === "image" ? `scene-${scene.index}-image${extname(storedPath)}` : `scene-${scene.index}-clip.mp4`;
      reply.header("Content-Disposition", `attachment; filename="${filename}"`);
      reply.header("Content-Length", statSync(fullPath).size);
      reply.type(contentType);
      return reply.send(createReadStream(fullPath));
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
      config: { swaggerTransform: binaryFileSwaggerTransform("video/mp4", "The assembled MP4 file (video/mp4)") },
      schema: {
        description:
          "Content-Disposition names the file after the project title: `<title>.mp4`, with control characters and `/ \\ : * ? \" < > |` replaced by `_`, whitespace collapsed, leading/trailing dots and spaces stripped, Windows reserved device names prefixed with `_`, capped at 100 characters, `final-video` when nothing remains. The header carries an ASCII `filename` and an RFC 5987 `filename*` with the full name.",
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
      reply.header("Content-Disposition", contentDisposition(downloadFilename(run.title)));
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
    // eslint-disable-next-line @typescript-eslint/require-await -- a Fastify handler is async by contract, so a throw becomes a rejected reply
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
      // response with no CORS header. Set it explicitly here instead. Foreign origins never get here
      // (originPolicy.ts refuses them), so the request's own origin can be echoed.
      ...(request.headers.origin ? { "Access-Control-Allow-Origin": request.headers.origin } : {}),
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

  // protect-admin-with-password (JOS-173), design Decision 3 — every Administrator endpoint lives in this child
  // plugin, under the `/admin` prefix, and none adds authentication of its own: the gate registered first
  // answers 401 before any body is parsed or handler runs. Other stories (JOS-171, JOS-172) add their routes here.
  await app.register(
    async (admin) => {
      registerAdminGate(admin);
      const typedAdmin = admin.withTypeProvider<ZodTypeProvider>();

      // Design Decision 4 — the gate has already answered 401 for every other case, so this handler only runs
      // for the correct password. The /admin page asks the 401 reason which of its states to show.
      typedAdmin.get(
        "/access",
        {
          schema: {
            response: { 200: z.object({ configured: z.literal(true), granted: z.literal(true) }), 401: adminDeniedSchema },
          },
        },
        // eslint-disable-next-line @typescript-eslint/require-await -- a Fastify handler is async by contract, so a throw becomes a rejected reply
        async () => ({ configured: true as const, granted: true as const }),
      );

      // change-active-provider-from-admin (JOS-171), design Decision 5.
      typedAdmin.get(
        "/providers",
        { schema: { response: { 200: z.object({ providers: z.array(providerViewSchema) }), 401: adminDeniedSchema } } },
        // eslint-disable-next-line @typescript-eslint/require-await -- a Fastify handler is async by contract, so a throw becomes a rejected reply
        async () => ({ providers: PROVIDER_STAGES.map((stage) => providerView(stage)) }),
      );

      typedAdmin.put(
        "/providers/:stage",
        {
          schema: {
            params: z.object({ stage: z.enum(PROVIDER_STAGES) }),
            body: z.object({ providerId: z.string().min(1) }),
            response: {
              200: providerViewSchema,
              // Either this route's own refusal or Fastify's validation error for a malformed stage or body.
              400: z.union([
                z.object({ ok: z.literal(false), reason: z.literal("not-selectable"), selectable: z.array(z.string()) }),
                z.object({ statusCode: z.number(), error: z.string(), message: z.string() }).passthrough(),
              ]),
              401: adminDeniedSchema,
              409: z.object({ ok: z.literal(false), reason: z.literal("not-usable"), problems: z.array(z.object({ field: z.string(), message: z.string() })) }),
            },
          },
        },
        async (request, reply) => {
          const { stage } = request.params;
          const selectable = selectableProviders(stage).map((provider) => provider.id);
          if (!selectable.includes(request.body.providerId)) return reply.code(400).send({ ok: false as const, reason: "not-selectable" as const, selectable });
          // manage-providers-from-admin (JOS-218), Decision 6 — a provider profile that is not usable cannot be made active.
          const profile = getProfile(request.body.providerId);
          if (profile) {
            const problems = profileProblems(profile);
            if (problems.length > 0) return reply.code(409).send({ ok: false as const, reason: "not-usable" as const, problems });
          }
          setActiveProvider(stage, request.body.providerId);
          return providerView(stage);
        },
      );

      registerProviderProfileRoutes(admin);
      registerFailedStageRoutes(admin);

      // admin-visual-style-prompt (JOS-201) — the style prompt; the reference image routes are their own plugin (raw-body parser).
      // eslint-disable-next-line @typescript-eslint/require-await -- a Fastify handler is async by contract, so a throw becomes a rejected reply
      typedAdmin.get("/settings", { schema: { response: { 200: appSettingsResponseSchema, 401: adminDeniedSchema } } }, async () => getAppSettings());
      typedAdmin.put(
        "/settings/visual-style-prompt",
        { schema: { body: visualStylePromptBodySchema, response: { 200: appSettingsResponseSchema, 401: adminDeniedSchema } } },
        // eslint-disable-next-line @typescript-eslint/require-await -- a Fastify handler is async by contract, so a throw becomes a rejected reply
        async (request) => saveVisualStylePrompt(request.body.visualStylePrompt),
      );
      await admin.register(adminSettingsImageRoutes);
    },
    { prefix: "/admin" },
  );

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
