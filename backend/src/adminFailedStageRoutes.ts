import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { adminDeniedSchema } from "./adminAccess.ts";
import { listFailedStages, moveFailedStage } from "./failedStages.ts";
import { PROVIDER_STAGES } from "./providerTypes.ts";

// move-failed-stage-to-active-provider (JOS-172), design Decision 6 — the failed-stage routes, registered inside the
// `/admin` child plugin so the Administrator gate has already answered 401 before any body is parsed.

const stageEnum = z.enum(PROVIDER_STAGES);

const failedStageSchema = z.object({
  sessionId: z.string(),
  sessionTitle: z.string(),
  stage: stageEnum,
  sceneId: z.string().nullable(),
  sceneNumber: z.number().nullable(),
  boundProviderId: z.string(),
  boundProviderLabel: z.string(),
  activeProviderId: z.string(),
  activeProviderLabel: z.string(),
  cause: z.string(),
});

/** Image and video are per scene and need its id; the session-level stages have none. */
const moveBodySchema = z
  .object({ sessionId: z.string().min(1), stage: stageEnum, sceneId: z.string().min(1).optional() })
  .superRefine((body, context) => {
    const perScene = body.stage === "image" || body.stage === "video";
    if (perScene && body.sceneId === undefined) context.addIssue({ code: "custom", path: ["sceneId"], message: "is required for an image or a video stage" });
    if (!perScene && body.sceneId !== undefined) context.addIssue({ code: "custom", path: ["sceneId"], message: "is only for an image or a video stage" });
  });

const validationErrorSchema = z.object({ statusCode: z.number(), error: z.string(), message: z.string() }).passthrough();

export function registerFailedStageRoutes(admin: FastifyInstance): void {
  const typedAdmin = admin.withTypeProvider<ZodTypeProvider>();

  typedAdmin.get(
    "/failed-stages",
    { schema: { response: { 200: z.object({ failedStages: z.array(failedStageSchema) }), 401: adminDeniedSchema } } },
    async () => ({ failedStages: listFailedStages() }),
  );

  typedAdmin.post(
    "/failed-stages/to-active-provider",
    {
      schema: {
        body: moveBodySchema,
        response: {
          200: z.object({
            moved: z.object({
              sessionId: z.string(),
              stage: stageEnum,
              sceneId: z.string().nullable(),
              providerId: z.string(),
              providerLabel: z.string(),
              requestedDurationSeconds: z.number().nullable(),
            }),
          }),
          400: validationErrorSchema,
          401: adminDeniedSchema,
          404: z.object({ ok: z.literal(false), reason: z.literal("not-found") }),
          409: z.object({ ok: z.literal(false), reason: z.enum(["not-failed", "already-on-active", "retry-in-progress", "not-retryable", "not-usable"]) }),
        },
      },
    },
    async (request, reply) => {
      const result = moveFailedStage({ sessionId: request.body.sessionId, stage: request.body.stage, ...(request.body.sceneId ? { sceneId: request.body.sceneId } : {}) });
      if (result.ok) return { moved: result.moved };
      if (result.reason === "not-found") return reply.code(404).send({ ok: false as const, reason: "not-found" as const });
      return reply.code(409).send({ ok: false as const, reason: result.reason });
    },
  );
}
