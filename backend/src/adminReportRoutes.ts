import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { adminDeniedSchema } from "./adminAccess.ts";
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

const validationErrorSchema = z.object({ statusCode: z.number(), error: z.string(), message: z.string() }).passthrough();

export function registerReportRoutes(admin: FastifyInstance): void {
  admin.withTypeProvider<ZodTypeProvider>().get(
    "/reports/provider-usage",
    { schema: { querystring: querySchema, response: { 200: reportSchema, 400: validationErrorSchema, 401: adminDeniedSchema } } },
    async (request, reply) => {
      // Stored instants are UTC `toISOString()` strings, so both bounds are normalized the same way before they are compared.
      const from = request.query.from ? new Date(request.query.from).toISOString() : undefined;
      const to = request.query.to ? new Date(request.query.to).toISOString() : new Date().toISOString();
      if (from !== undefined && from >= to) return reply.code(400).send({ statusCode: 400, error: "Bad Request", message: "querystring/from must be before to" });
      return providerUsageReport({ ...(from ? { from } : {}), to });
    },
  );
}
