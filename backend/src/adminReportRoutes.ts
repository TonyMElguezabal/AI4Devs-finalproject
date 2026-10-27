import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { adminDeniedSchema } from "./adminAccess.ts";
import { failuresReport } from "./failuresReport.ts";
import { pipelineTimeReport } from "./pipelineTimeReport.ts";
import { providerChangesReport } from "./providerChangesReport.ts";
import { providerUsageReport } from "./providerUsageReport.ts";
import { sessionScenesReport, sessionsReport } from "./sessionsReport.ts";

// report-provider-usage (JOS-223), design Decision 1 — the report routes, registered inside the `/admin` child plugin
// so the Administrator gate has already answered 401 before any query is parsed.

const instantSchema = z.string().datetime({ offset: true });
const querySchema = z.object({ from: instantSchema.optional(), to: instantSchema.optional() });

const rowSchema = z.object({
  stage: z.enum(["voice", "alignment", "reasoning", "image", "video"]),
  providerId: z.string(),
  providerLabel: z.string(),
  attempts: z.number(),
  successes: z.number(),
  transient: z.number(),
  notRetryable: z.number(),
  timedOut: z.number(),
  successRatePercent: z.number(),
  medianLatencyMs: z.number().nullable(),
  p95LatencyMs: z.number().nullable(),
  billedUnits: z.number(),
  unit: z.string(),
});

const reportSchema = z.object({
  from: z.string().nullable(),
  to: z.string(),
  sceneAttemptsFollowCurrentProvider: z.boolean(),
  rows: z.array(rowSchema),
});

const phaseSchema = z.enum(["voice-over", "decomposition", "scenes", "assembly"]);

// record-phase-instants-and-pipeline-report (JOS-228) — the pipeline-time report; `null` counts are "not recorded".
const pipelineReportSchema = z.object({
  from: z.string().nullable(),
  to: z.string(),
  phases: z.array(
    z.object({
      phase: phaseSchema,
      sessions: z.number(),
      medianSeconds: z.number().nullable(),
      p95Seconds: z.number().nullable(),
      timedOut: z.number().nullable(),
      finishedLate: z.number().nullable(),
      superseded: z.number().nullable(),
    }),
  ),
  sessions: z.array(z.object({ runId: z.string(), title: z.string(), seconds: z.record(phaseSchema, z.number().nullable()) })),
});

// report-failures-and-retries (JOS-224) — `null` budgets and manual retries are "not recorded" (the scene stages keep no cycles).
const failuresReportSchema = z.object({
  from: z.string().nullable(),
  to: z.string(),
  stages: z.array(
    z.object({
      stage: z.enum(["voice", "alignment", "reasoning", "image", "video"]),
      transient: z.number(),
      notRetryable: z.number(),
      timedOut: z.number(),
      budgetsExhausted: z.number().nullable(),
      manualRetries: z.number().nullable(),
    }),
  ),
  wordings: z.array(z.object({ stage: z.enum(["voice", "alignment", "reasoning"]), message: z.string(), attempts: z.number() })),
  failedScenesNow: z.object({ image: z.number(), video: z.number() }),
});

// report-sessions (JOS-225), design Decision 6 — no text column other than the title is part of either response.
const sessionsReportSchema = z.object({
  from: z.string().nullable(),
  to: z.string(),
  rows: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      createdAt: z.string(),
      state: z.enum(["final-video-ready", "failed", "in-progress"]),
      failedPhase: z.enum(["voice-over", "decomposition", "assembly"]).nullable(),
      paused: z.boolean(),
      scenes: z.number(),
      failedScenes: z.number(),
      attempts: z.number(),
      secondsToVoiceOver: z.number().nullable(),
      secondsToFinalVideo: z.number().nullable(),
    }),
  ),
});

const sessionScenesSchema = z.object({
  sessionId: z.string(),
  rows: z.array(
    z.object({
      number: z.number(),
      status: z.string(),
      imageProvider: z.string().nullable(),
      clipProvider: z.string().nullable(),
      imageAttempts: z.number(),
      clipAttempts: z.number(),
      requestedDurationSeconds: z.number().nullable(),
      speedFactor: z.number().nullable(),
      durationWarning: z.string().nullable(),
      speedFactorWarning: z.string().nullable(),
    }),
  ),
});

// record-provider-changes (JOS-229), design Decision 4 — ids, logged display names, the session title and the scene number only.
const providerChangesSchema = z.object({
  from: z.string().nullable(),
  to: z.string(),
  entries: z.array(
    z.object({
      changedAt: z.string(),
      kind: z.enum(["active-provider", "failed-stage-move"]),
      stage: z.enum(["reasoning", "voice", "alignment", "image", "video"]),
      sessionId: z.string().nullable(),
      sessionTitle: z.string().nullable(),
      sceneNumber: z.number().nullable(),
      previousProviderId: z.string(),
      previousProviderLabel: z.string(),
      newProviderId: z.string(),
      newProviderLabel: z.string(),
    }),
  ),
});

const validationErrorSchema = z.object({ statusCode: z.number(), error: z.string(), message: z.string() }).passthrough();

/** The period of a report request: both bounds normalized to the stored UTC form, or the 400 message when `from` is not before `to`. */
function periodOf(query: z.infer<typeof querySchema>): { from?: string; to: string } | { error: string } {
  // Stored instants are UTC `toISOString()` strings, so both bounds are normalized the same way before they are compared.
  const from = query.from ? new Date(query.from).toISOString() : undefined;
  const to = query.to ? new Date(query.to).toISOString() : new Date().toISOString();
  if (from !== undefined && from >= to) return { error: "querystring/from must be before to" };
  return { ...(from ? { from } : {}), to };
}

export function registerReportRoutes(admin: FastifyInstance): void {
  admin.withTypeProvider<ZodTypeProvider>().get(
    "/reports/provider-usage",
    { schema: { querystring: querySchema, response: { 200: reportSchema, 400: validationErrorSchema, 401: adminDeniedSchema } } },
    async (request, reply) => {
      const period = periodOf(request.query);
      if ("error" in period) return reply.code(400).send({ statusCode: 400, error: "Bad Request", message: period.error });
      return providerUsageReport(period);
    },
  );

  admin.withTypeProvider<ZodTypeProvider>().get(
    "/reports/pipeline-time",
    { schema: { querystring: querySchema, response: { 200: pipelineReportSchema, 400: validationErrorSchema, 401: adminDeniedSchema } } },
    async (request, reply) => {
      const period = periodOf(request.query);
      if ("error" in period) return reply.code(400).send({ statusCode: 400, error: "Bad Request", message: period.error });
      return pipelineTimeReport(period);
    },
  );

  admin.withTypeProvider<ZodTypeProvider>().get(
    "/reports/failures",
    { schema: { querystring: querySchema, response: { 200: failuresReportSchema, 400: validationErrorSchema, 401: adminDeniedSchema } } },
    async (request, reply) => {
      const period = periodOf(request.query);
      if ("error" in period) return reply.code(400).send({ statusCode: 400, error: "Bad Request", message: period.error });
      return failuresReport(period);
    },
  );

  admin.withTypeProvider<ZodTypeProvider>().get(
    "/reports/sessions",
    { schema: { querystring: querySchema, response: { 200: sessionsReportSchema, 400: validationErrorSchema, 401: adminDeniedSchema } } },
    async (request, reply) => {
      const period = periodOf(request.query);
      if ("error" in period) return reply.code(400).send({ statusCode: 400, error: "Bad Request", message: period.error });
      return sessionsReport(period);
    },
  );

  admin.withTypeProvider<ZodTypeProvider>().get(
    "/reports/sessions/:sessionId/scenes",
    { schema: { params: z.object({ sessionId: z.string() }), response: { 200: sessionScenesSchema, 401: adminDeniedSchema, 404: validationErrorSchema } } },
    async (request, reply) => {
      const report = sessionScenesReport(request.params.sessionId);
      if (!report) return reply.code(404).send({ statusCode: 404, error: "Not Found", message: "There is no such session." });
      return report;
    },
  );

  admin.withTypeProvider<ZodTypeProvider>().get(
    "/reports/provider-changes",
    { schema: { querystring: querySchema, response: { 200: providerChangesSchema, 400: validationErrorSchema, 401: adminDeniedSchema } } },
    async (request, reply) => {
      const period = periodOf(request.query);
      if ("error" in period) return reply.code(400).send({ statusCode: 400, error: "Bad Request", message: period.error });
      return providerChangesReport(period);
    },
  );
}
