import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { adminDeniedSchema } from "./adminAccess.ts";
import { pipelineTimeReport } from "./pipelineTimeReport.ts";
import { providerUsageReport } from "./providerUsageReport.ts";

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
}
