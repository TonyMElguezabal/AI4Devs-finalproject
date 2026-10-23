import type { FastifyPluginAsync } from "fastify";
import { randomUUID } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type ZodTypeProvider } from "fastify-type-provider-zod";
import { APP_DATA_DIR, clearReferenceImage, getReferenceImageFile, saveReferenceImage } from "./db.ts";
import { adminDeniedSchema } from "./adminAccess.ts";
import { appSettingsResponseSchema, refusalResponseSchema } from "./adminSettingsSchemas.ts";

// admin-visual-style-prompt (JOS-201), design Decision 6 — the reference image routes live in their own encapsulated plugin,
// so the raw-body parser below applies to them only (no @fastify/multipart for one file). It is registered inside the
// `/admin` plugin, behind the Administrator gate (protect-admin-with-password, JOS-173), which adds the prefix.

export const MAX_REFERENCE_IMAGE_BYTES = 5 * 1024 * 1024;

const IMAGE_TYPES = {
  "image/png": { extension: ".png", matches: (b: Buffer) => b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  "image/jpeg": { extension: ".jpg", matches: (b: Buffer) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  "image/webp": { extension: ".webp", matches: (b: Buffer) => b.length >= 12 && b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP" },
} as const;

type ImageType = keyof typeof IMAGE_TYPES;
const isImageType = (value: string): value is ImageType => Object.hasOwn(IMAGE_TYPES, value);

// eslint-disable-next-line @typescript-eslint/require-await -- a Fastify plugin must be async
export const adminSettingsImageRoutes: FastifyPluginAsync = async (app) => {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  // Every content type reaches the handler as a Buffer, so a GIF or a missing type is answered 400 there, not Fastify's 415.
  // The built-in text and JSON parsers go first: they decode to a string and would reject binary bytes as a size mismatch.
  app.removeAllContentTypeParsers();
  app.addContentTypeParser("*", { parseAs: "buffer", bodyLimit: MAX_REFERENCE_IMAGE_BYTES }, (_request, body, done) => done(null, body));

  typed.put(
    "/settings/reference-image",
    { bodyLimit: MAX_REFERENCE_IMAGE_BYTES, schema: { response: { 200: appSettingsResponseSchema, 400: refusalResponseSchema, 401: adminDeniedSchema } } },
    async (request, reply) => {
      const declared = (request.headers["content-type"] ?? "").split(";")[0]!.trim().toLowerCase();
      const bytes = request.body;
      if (!isImageType(declared)) return reply.code(400).send({ ok: false, reason: "the image must be image/png, image/jpeg or image/webp" });
      if (!Buffer.isBuffer(bytes) || !IMAGE_TYPES[declared].matches(bytes)) {
        return reply.code(400).send({ ok: false, reason: `the file is not a valid ${declared} image` });
      }

      const directory = join(APP_DATA_DIR, "admin");
      mkdirSync(directory, { recursive: true });
      const fileName = `reference-image${IMAGE_TYPES[declared].extension}`;
      const temporaryPath = join(directory, `${fileName}.${randomUUID()}.tmp`);
      const previous = getReferenceImageFile();
      try {
        writeFileSync(temporaryPath, bytes);
        renameSync(temporaryPath, join(directory, fileName));
      } finally {
        rmSync(temporaryPath, { force: true });
      }
      const saved = saveReferenceImage(`admin/${fileName}`, declared);
      if (previous && previous.path !== join(directory, fileName)) {
        const referenceImagePath = previous.path; // the replaced image, in the app data directory, never a project file
        rmSync(referenceImagePath, { force: true });
      }
      return saved;
    },
  );

  app.get("/settings/reference-image", { schema: { response: { 401: adminDeniedSchema, 404: refusalResponseSchema } } }, async (_request, reply) => {
    const stored = getReferenceImageFile();
    if (!stored || !existsSync(stored.path)) return reply.code(404).send({ ok: false, reason: "no reference image is stored" });
    return reply.type(stored.contentType).send(createReadStream(stored.path));
  });

  typed.delete("/settings/reference-image", async (_request, reply) => {
    const stored = getReferenceImageFile();
    if (stored) {
      const referenceImagePath = stored.path;
      rmSync(referenceImagePath, { force: true });
    }
    clearReferenceImage();
    return reply.code(204).send();
  });
};
