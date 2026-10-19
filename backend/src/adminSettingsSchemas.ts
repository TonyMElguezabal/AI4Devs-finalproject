import { z } from "zod";
import { MAX_VISUAL_STYLE_PROMPT_CHARS } from "./db.ts";

// admin-visual-style-prompt (JOS-201) — the shapes shared by the settings routes.

export const appSettingsResponseSchema = z.object({
  visualStylePrompt: z.string(),
  referenceImage: z.object({ contentType: z.string(), sizeBytes: z.number().int(), updatedAt: z.string() }).nullable(),
  updatedAt: z.string(),
});

/** Trimmed first, so the limit counts what is stored. */
export const visualStylePromptBodySchema = z.object({
  visualStylePrompt: z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().max(MAX_VISUAL_STYLE_PROMPT_CHARS)),
});

/** The app's own refusal shape, as the other routes answer it. */
export const refusalResponseSchema = z.object({ ok: z.literal(false), reason: z.string() });
