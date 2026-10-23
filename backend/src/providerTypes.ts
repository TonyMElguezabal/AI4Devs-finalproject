import { z } from "zod";
import { describeIssue } from "./config/issues.ts";

// manage-providers-from-admin (JOS-218), design Decision 2 — the adapter types this build ships, per stage: the rules
// of their parameters (written once and reused by the settings schema) and the description of their fields for the
// /admin form. An adapter type sends its requests to its own vendor's host, which lives in the adapter: no parameter
// can name a host or a URL, so a key can only go to that vendor.

export const PROVIDER_STAGES = ["reasoning", "voice", "alignment", "image", "video"] as const;
export type ProviderStage = (typeof PROVIDER_STAGES)[number];

/** The one adapter type each stage ships today, and the id the first profile of that stage keeps (Decision 1). */
export const SEEDED_PROFILES: Record<ProviderStage, { adapterType: string; id: string }> = {
  reasoning: { adapterType: "openai-reasoning", id: "openai-decomposition" },
  voice: { adapterType: "elevenlabs-voice", id: "ElevenLabs" },
  alignment: { adapterType: "elevenlabs-alignment", id: "elevenlabs-forced-alignment" },
  image: { adapterType: "fal-image", id: "Fal.ai" },
  video: { adapterType: "runninghub-video", id: "RunningHub" },
};

export const nonEmptyString = z.string().min(1);
export const positiveInteger = z.number().int().min(1);

/** A path on the vendor's host, never a URL: it starts with `/` and names no scheme or host. */
const vendorPath = nonEmptyString.refine((value) => value.startsWith("/") && !value.startsWith("//") && !value.includes("://"), {
  message: "must be a path that starts with /, not a URL",
});

/** A model identifier as the vendor writes it: letters, digits and `.`, `_`, `-`, `/`, `:`, with no scheme. */
const modelId = nonEmptyString.refine((value) => /^[A-Za-z0-9._\-/:]+$/.test(value) && !value.includes("://"), {
  message: "must be a model identifier, not a URL",
});

/** ElevenLabs accepts 0.7 to 1.2. A custom check keeps the rejected value out of the message. */
export const voiceSpeed = z.custom<"default" | number>((value) => value === "default" || (typeof value === "number" && value >= 0.7 && value <= 1.2), {
  message: 'must be "default" or a number from 0.7 to 1.2',
});

/** The parameter rules of each adapter type, as zod shapes so the settings schema can reuse them. */
export const PARAMETER_SHAPES = {
  "openai-reasoning": { model: modelId },
  "elevenlabs-voice": { model: modelId, voiceId: nonEmptyString, voiceName: nonEmptyString, outputFormat: nonEmptyString, speed: voiceSpeed },
  "elevenlabs-alignment": { endpoint: vendorPath },
  "fal-image": { model: modelId },
  "runninghub-video": {
    endpoint: vendorPath,
    admittedDurationSeconds: z.strictObject({ min: positiveInteger, max: positiveInteger }),
  },
} as const;

const KNOWN_CURRENCIES = new Set(Intl.supportedValuesOf("currency"));

// add-provider-price-per-unit (JOS-226), design Decisions 1 and 2 — the optional price of a profile. Not part of
// PARAMETER_SHAPES, so the settings files keep rejecting it: a price is entered on /admin only.
const PRICE_SHAPE = {
  pricePerUnit: z.number().finite().min(0).optional(),
  priceCurrency: z
    .string()
    .transform((value) => value.toUpperCase())
    .refine((value) => KNOWN_CURRENCIES.has(value), { message: "must be a three-letter currency code such as USD" })
    .optional(),
};

/** The parameter keys that hold the price: ignored when a profile is compared with the settings files. */
export const PRICE_KEYS = ["pricePerUnit", "priceCurrency"] as const;

/** The unit each stage bills in, the vocabulary of the admin reports catalogue. */
export const BILLED_UNITS: Record<ProviderStage, { id: string; label: string }> = {
  voice: { id: "voice_characters", label: "voice character" },
  alignment: { id: "audio_seconds", label: "audio second" },
  reasoning: { id: "requests", label: "request" },
  image: { id: "images", label: "image" },
  video: { id: "clip_seconds", label: "clip second" },
};

export type ParameterField = {
  /** Where the value sits in the parameters object, for example `["admittedDurationSeconds", "min"]`. */
  path: string[];
  label: string;
  kind: "text" | "number" | "choice";
  required: boolean;
  help?: string;
  /** For a `choice` field, the accepted values; a number field may also accept them as text (the voice speed). */
  choices?: string[];
  /** A text field whose value is a number when it parses as one (the voice speed is `default` or a number). */
  acceptsNumber?: boolean;
};

export interface AdapterType {
  id: string;
  stage: ProviderStage;
  label: string;
  fields: ParameterField[];
}

const ADAPTER_TYPE_DEFINITIONS: AdapterType[] = [
  {
    id: "openai-reasoning",
    stage: "reasoning",
    label: "OpenAI",
    fields: [{ path: ["model"], label: "Model", kind: "text", required: true, help: "The model identifier used for the script division and the visual instructions." }],
  },
  {
    id: "elevenlabs-voice",
    stage: "voice",
    label: "ElevenLabs",
    fields: [
      { path: ["model"], label: "Model", kind: "text", required: true },
      { path: ["voiceId"], label: "Voice id", kind: "text", required: true },
      { path: ["voiceName"], label: "Voice name", kind: "text", required: true, help: "Shown in the interface only." },
      { path: ["outputFormat"], label: "Output format", kind: "text", required: true, help: "For example mp3_44100_128." },
      { path: ["speed"], label: "Speed", kind: "text", required: true, acceptsNumber: true, help: "Write default, or a number from 0.7 to 1.2." },
    ],
  },
  {
    id: "elevenlabs-alignment",
    stage: "alignment",
    label: "ElevenLabs forced alignment",
    fields: [{ path: ["endpoint"], label: "Endpoint path", kind: "text", required: true, help: "A path on the vendor's host, such as /v1/forced-alignment." }],
  },
  {
    id: "fal-image",
    stage: "image",
    label: "Fal.ai",
    fields: [{ path: ["model"], label: "Model", kind: "text", required: true, help: "For example fal-ai/flux/dev." }],
  },
  {
    id: "runninghub-video",
    stage: "video",
    label: "RunningHub",
    fields: [
      { path: ["endpoint"], label: "Endpoint path", kind: "text", required: true, help: "A path on the vendor's host." },
      { path: ["admittedDurationSeconds", "min"], label: "Shortest clip (seconds)", kind: "number", required: true },
      { path: ["admittedDurationSeconds", "max"], label: "Longest clip (seconds)", kind: "number", required: true },
    ],
  },
];

/** Every adapter type ends with the optional price and currency fields, labelled with its stage's billed unit. */
export const ADAPTER_TYPES: AdapterType[] = ADAPTER_TYPE_DEFINITIONS.map((type) => ({
  ...type,
  fields: [
    ...type.fields,
    { path: ["pricePerUnit"], label: `Price per ${BILLED_UNITS[type.stage].label}`, kind: "number", required: false, help: "Optional. Leave empty if the provider has no price." },
    { path: ["priceCurrency"], label: "Currency", kind: "text", required: false, help: "A three-letter code such as USD. Needed with a price." },
  ],
}));

export function adapterTypesOf(stage: ProviderStage): AdapterType[] {
  return ADAPTER_TYPES.filter((type) => type.stage === stage);
}

export function getAdapterType(id: string): AdapterType | undefined {
  return ADAPTER_TYPES.find((type) => type.id === id);
}

function schemaFor(id: keyof typeof PARAMETER_SHAPES): z.ZodTypeAny {
  const strict = z.strictObject({ ...PARAMETER_SHAPES[id], ...PRICE_SHAPE });
  return strict.superRefine((parameters, context) => {
    const { pricePerUnit, priceCurrency, admittedDurationSeconds } = parameters as { pricePerUnit?: number; priceCurrency?: string; admittedDurationSeconds?: { min: number; max: number } };
    if (admittedDurationSeconds && admittedDurationSeconds.min > admittedDurationSeconds.max) {
      context.addIssue({ code: "custom", path: ["admittedDurationSeconds", "min"], message: "must not be greater than admittedDurationSeconds.max" });
    }
    if (pricePerUnit !== undefined && priceCurrency === undefined) context.addIssue({ code: "custom", path: ["priceCurrency"], message: "is required with a price per unit" });
    if (priceCurrency !== undefined && pricePerUnit === undefined) context.addIssue({ code: "custom", path: ["pricePerUnit"], message: "is required with a currency" });
  });
}

export interface ParameterProblem {
  field: string;
  message: string;
}

export type ParameterValidation = { ok: true; parameters: Record<string, unknown> } | { ok: false; problems: ParameterProblem[] };

/** Every problem of a parameter set, one per field and each with its field, none with a value. */
export function validateProviderParameters(adapterType: string, input: unknown): ParameterValidation {
  if (!(adapterType in PARAMETER_SHAPES)) return { ok: false, problems: [{ field: "adapterType", message: "adapterType: unknown adapter type" }] };
  const parsed = schemaFor(adapterType as keyof typeof PARAMETER_SHAPES).safeParse(input);
  if (parsed.success) return { ok: true, parameters: parsed.data as Record<string, unknown> };
  const byField = new Map<string, ParameterProblem>();
  for (const issue of parsed.error.issues) {
    const fields = issue.code === "unrecognized_keys" ? issue.keys.map((key) => [...issue.path, key].join(".")) : [issue.path.join(".")];
    const messages = describeIssue(issue, "parameter");
    fields.forEach((field, index) => {
      if (!byField.has(field)) byField.set(field, { field, message: messages[index] ?? messages[0]! });
    });
  }
  return { ok: false, problems: [...byField.values()].sort((a, b) => a.field.localeCompare(b.field)) };
}
