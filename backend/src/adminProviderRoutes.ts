import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { adminDeniedSchema } from "./adminAccess.ts";
import { createProfile, deleteProfile, editProfile, listProfileViews } from "./providerAdmin.ts";
import { ADAPTER_TYPES, PROVIDER_STAGES } from "./providerTypes.ts";

// manage-providers-from-admin (JOS-218), design Decision 9 — the provider-profile routes. They are registered inside
// the `/admin` child plugin, so the Administrator gate has already answered 401 before any body is parsed.

const problemSchema = z.object({ field: z.string(), message: z.string() });
const problemsSchema = z.object({ ok: z.literal(false), problems: z.array(problemSchema) });
const notFoundSchema = z.object({ ok: z.literal(false), reason: z.literal("not-found") });
/** Either a route's own refusal, or Fastify's validation error for a malformed body or parameter. */
const validationErrorSchema = z.object({ statusCode: z.number(), error: z.string(), message: z.string() }).passthrough();

export const profileViewSchema = z.object({
  id: z.string(),
  stage: z.enum(PROVIDER_STAGES),
  adapterType: z.string(),
  label: z.string(),
  parameters: z.record(z.unknown()),
  keyStatus: z.enum(["stored", "environment", "missing"]),
  keyHint: z.string().nullable(),
  usable: z.boolean(),
  problems: z.array(problemSchema),
  active: z.boolean(),
  retired: z.boolean(),
});

const fieldSchema = z.object({
  path: z.array(z.string()),
  label: z.string(),
  kind: z.enum(["text", "number", "choice"]),
  required: z.boolean(),
  help: z.string().optional(),
  choices: z.array(z.string()).optional(),
  acceptsNumber: z.boolean().optional(),
});

export function registerProviderProfileRoutes(admin: FastifyInstance): void {
  const typedAdmin = admin.withTypeProvider<ZodTypeProvider>();

  typedAdmin.get(
    "/provider-types",
    { schema: { response: { 200: z.object({ types: z.array(z.object({ id: z.string(), stage: z.enum(PROVIDER_STAGES), label: z.string(), fields: z.array(fieldSchema) })) }), 401: adminDeniedSchema } } },
    // eslint-disable-next-line @typescript-eslint/require-await -- a Fastify handler is async by contract, so a throw becomes a rejected reply
    async () => ({ types: ADAPTER_TYPES }),
  );

  typedAdmin.get(
    "/provider-profiles",
    { schema: { response: { 200: z.object({ profiles: z.array(profileViewSchema) }), 401: adminDeniedSchema } } },
    // eslint-disable-next-line @typescript-eslint/require-await -- a Fastify handler is async by contract, so a throw becomes a rejected reply
    async () => ({ profiles: listProfileViews() }),
  );

  typedAdmin.post(
    "/provider-profiles",
    {
      schema: {
        body: z.object({ stage: z.enum(PROVIDER_STAGES), adapterType: z.string(), label: z.string(), parameters: z.record(z.unknown()), apiKey: z.string().optional() }),
        response: { 201: profileViewSchema, 400: z.union([problemsSchema, validationErrorSchema]), 401: adminDeniedSchema },
      },
    },
    async (request, reply) => {
      const result = createProfile(request.body);
      if (result.ok) return reply.code(201).send(result.profile);
      return reply.code(400).send({ ok: false as const, problems: result.kind === "invalid" ? result.problems : [] });
    },
  );

  typedAdmin.put(
    "/provider-profiles/:id",
    {
      schema: {
        params: z.object({ id: z.string().min(1) }),
        body: z.object({ label: z.string(), parameters: z.record(z.unknown()), apiKey: z.string().optional() }),
        response: { 200: profileViewSchema, 400: z.union([problemsSchema, validationErrorSchema]), 401: adminDeniedSchema, 404: notFoundSchema },
      },
    },
    async (request, reply) => {
      const result = editProfile(request.params.id, request.body);
      if (result.ok) return result.profile;
      if (result.kind === "not-found") return reply.code(404).send({ ok: false as const, reason: "not-found" as const });
      return reply.code(400).send({ ok: false as const, problems: result.problems });
    },
  );

  typedAdmin.delete(
    "/provider-profiles/:id",
    {
      schema: {
        params: z.object({ id: z.string().min(1) }),
        response: {
          200: z.object({ result: z.enum(["removed", "retired"]) }),
          401: adminDeniedSchema,
          404: notFoundSchema,
          409: z.object({ ok: z.literal(false), reason: z.literal("active"), stage: z.enum(PROVIDER_STAGES) }),
        },
      },
    },
    async (request, reply) => {
      const result = deleteProfile(request.params.id);
      if (result.ok) return { result: result.result };
      if (result.kind === "not-found") return reply.code(404).send({ ok: false as const, reason: "not-found" as const });
      return reply.code(409).send({ ok: false as const, reason: "active" as const, stage: result.stage });
    },
  );
}
