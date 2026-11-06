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
export const modelId = nonEmptyString.refine((value) => /^[A-Za-z0-9._\-/:]+$/.test(value) && !value.includes("://"), {
  message: "must be a model identifier, not a URL",
});

/** ElevenLabs accepts 0.7 to 1.2. A custom check keeps the rejected value out of the message. */
export const voiceSpeed = z.custom<"default" | number>((value) => value === "default" || (typeof value === "number" && value >= 0.7 && value <= 1.2), {
  message: 'must be "default" or a number from 0.7 to 1.2',
});

// configurable-video-connector (JOS-219), design Decisions 1, 2, 5 and 9 — a video provider described on /admin.

/** `https://` and a host with an optional port, nothing else: the key goes only to this host (Decision 5). */
const connectorBaseUrl = nonEmptyString.refine(
  (value) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && url.username === "" && url.password === "" && url.pathname === "/" && url.search === "" && url.hash === "" && !value.includes("?") && !value.includes("#");
    } catch {
      return false;
    }
  },
  { message: "must be https:// followed by a host and an optional port, with no path, query or credentials" },
);

/** Decision 9: clips are requested at 1080p or below, to keep the cost per clip second down. */
// ponytail: a name check, not a measurement; a tier above 1080p under another name gets through (JOS-265 can measure the clip).
const ABOVE_1080P = /2k|4k|1440|2160|2560|3840/i;
const clipResolution = nonEmptyString.refine((value) => !ABOVE_1080P.test(value), { message: "must be at most 1080p (2K and above cost too much per clip second)" });

const PLACEHOLDER = /\{([a-z0-9_]+)\}/g;
const ALL_PLACEHOLDERS = ["instruction", "duration", "model", "resolution", "image_data_uri", "image_base64", "image_url", "task_id", "key"] as const;
const STEP_NAMES = ["upload", "submit", "poll", "check"] as const;
type StepName = (typeof STEP_NAMES)[number];

function placeholdersIn(value: unknown): string[] {
  if (typeof value === "string") return [...value.matchAll(PLACEHOLDER)].map((match) => match[1]!);
  if (Array.isArray(value)) return value.flatMap(placeholdersIn);
  if (typeof value === "object" && value !== null) return Object.values(value).flatMap(placeholdersIn);
  return [];
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isVendorPath = (value: unknown): boolean => typeof value === "string" && value.startsWith("/") && !value.startsWith("//") && !value.includes("://");

/**
 * Every problem of a connector's `requests`, each at its path. Written by hand rather than as a nested zod schema, so the
 * placeholder rules still run when a required field is missing and every problem is listed at once (Decision 8).
 */
function connectorRequestProblems(requests: unknown): Array<{ path: string[]; message: string }> {
  const problems: Array<{ path: string[]; message: string }> = [];
  const problem = (path: string[], message: string) => problems.push({ path: ["requests", ...path], message });
  if (!isRecord(requests)) return [{ path: ["requests"], message: "must be a JSON object" }];
  const known = new Set<string>(["headers", ...STEP_NAMES]);
  for (const key of Object.keys(requests)) if (!known.has(key)) problem([key], "is not a part of a definition");

  const headers = requests.headers;
  if (!isRecord(headers) || Object.values(headers).some((value) => typeof value !== "string")) problem(["headers"], "must be an object of header names and text values");
  else if (placeholdersIn(headers).some((name) => !["key", "model", "resolution"].includes(name))) problem(["headers"], "may only use {key}, {model} and {resolution}");

  const hasUpload = requests.upload !== undefined && requests.upload !== null;
  const stepAllows = (step: StepName, place: "path" | "body"): string[] => {
    const base = ["model", "resolution"];
    if (place === "path") return step === "poll" ? [...base, "task_id"] : base;
    const body = [...base, "instruction", "duration", "image_data_uri", "image_base64", ...(hasUpload ? ["image_url"] : [])];
    return step === "poll" ? [...base, "task_id"] : body;
  };
  const checkPlaceholders = (step: StepName, place: "path" | "body", value: unknown) => {
    const used = placeholdersIn(value);
    const allowed = stepAllows(step, place);
    const wrong = used.filter((name) => !allowed.includes(name));
    if (wrong.length === 0) return;
    const reason = wrong.includes("key")
      ? "may not use {key}: the key goes only in a header"
      : wrong.some((name) => !(ALL_PLACEHOLDERS as readonly string[]).includes(name))
        ? `uses an unknown placeholder; the placeholders are ${ALL_PLACEHOLDERS.map((name) => `{${name}}`).join(", ")}`
        : `may not use ${wrong.map((name) => `{${name}}`).join(", ")} in the ${step} step${wrong.includes("image_url") ? " (only after an upload step)" : ""}`;
    problem([step, place], reason);
  };
  const requireText = (step: StepName, value: Record<string, unknown>, field: string) => {
    if (typeof value[field] !== "string" || value[field] === "") problem([step, field], "is required");
  };
  const requireStatus = (step: StepName, value: Record<string, unknown>, field: string) => {
    if (value[field] !== undefined && !(Number.isInteger(value[field]) && (value[field] as number) >= 100 && (value[field] as number) <= 599)) problem([step, field], "must be an HTTP status");
  };
  const requireTextList = (step: StepName, value: Record<string, unknown>, field: string) => {
    const list = value[field];
    if (!Array.isArray(list) || list.length === 0 || list.some((item) => typeof item !== "string")) problem([step, field], "must be a list of status values");
  };

  for (const step of STEP_NAMES) {
    const value = requests[step];
    if (value === undefined || value === null) {
      if (step === "submit" || step === "poll") problem([step], "is required");
      continue;
    }
    if (!isRecord(value)) {
      problem([step], "must be an object");
      continue;
    }
    if (!isVendorPath(value.path)) problem([step, "path"], "must be a path that starts with /, not a URL");
    else checkPlaceholders(step, "path", value.path);
    if (step !== "upload" && value.method !== undefined && value.method !== "GET" && value.method !== "POST") problem([step, "method"], "must be GET or POST");
    if (value.body !== undefined) {
      if (step === "upload" || step === "check") problem([step, "body"], `is not used by the ${step} step`);
      else checkPlaceholders(step, "body", value.body);
    }
    if (value.errorAt !== undefined && typeof value.errorAt !== "string") problem([step, "errorAt"], "must be a path such as errorCode");
    if (value.okErrorValues !== undefined && !Array.isArray(value.okErrorValues)) problem([step, "okErrorValues"], "must be a list");
    if (step === "upload") {
      requireText(step, value, "multipartField");
      requireText(step, value, "urlAt");
    }
    if (step === "submit") requireText(step, value, "taskIdAt");
    if (step === "poll") {
      requireText(step, value, "statusAt");
      requireText(step, value, "videoUrlAt");
      requireTextList(step, value, "doneWhen");
      requireTextList(step, value, "failedWhen");
      requireStatus(step, value, "notFoundStatus");
    }
    if (step === "check") {
      requireStatus(step, value, "connectedStatus");
      if (value.charged !== undefined && typeof value.charged !== "boolean") problem([step, "charged"], "must be true or false");
    }
  }
  return problems;
}

const connectorRequests = z.unknown().superRefine((requests, context) => {
  for (const { path, message } of connectorRequestProblems(requests)) context.addIssue({ code: "custom", path: path.slice(1), message });
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
    // configurable-video-connector (JOS-219), Decision 9 — RunningHub's tiers are 768P and 2K, and 2K is not offered.
    resolution: z.enum(["768P"]).default("768P"),
  },
  "configured-video": {
    baseUrl: connectorBaseUrl,
    model: modelId,
    resolution: clipResolution,
    admittedDurationSeconds: z.strictObject({ min: positiveInteger, max: positiveInteger }),
    requests: connectorRequests,
  },
} as const;

/** The adapter types this build ships (JOS-262): every table of per-adapter-type behaviour is keyed by it. */
export type AdapterTypeId = keyof typeof PARAMETER_SHAPES;

/**
 * report-stable-provider-name (JOS-213), Decision 1 — the one vendor name telemetry reports for each adapter type. An adapter
 * type sends to its own vendor's host, so this is fixed; a profile's label is free text and is never sent. Keyed by the shapes'
 * keys, so a new adapter type does not compile until it names its vendor.
 */
export const ADAPTER_VENDORS: Record<AdapterTypeId, string> = {
  "openai-reasoning": "OpenAI",
  "elevenlabs-voice": "ElevenLabs",
  "elevenlabs-alignment": "ElevenLabs",
  "fal-image": "Fal.ai",
  "runninghub-video": "RunningHub",
  // A connector's telemetry vendor is its base URL host (db.ts); this name stands where no profile is at hand.
  "configured-video": "Configured connector",
};

const KNOWN_CURRENCIES = new Set(Intl.supportedValuesOf("currency"));

// add-provider-price-per-unit (JOS-226), design Decisions 1 and 2 — the optional price of a profile. Not part of
// PARAMETER_SHAPES, so the settings files keep rejecting it: a price is entered on /admin only.
export const PRICE_SHAPE = {
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
  /** `json` (configurable-video-connector, JOS-219, Decision 8): a text area holding JSON, parsed before it is saved. */
  kind: "text" | "number" | "choice" | "json";
  required: boolean;
  help?: string;
  /** For a `choice` field, the accepted values; a number field may also accept them as text (the voice speed). */
  choices?: string[];
  /** A text field whose value is a number when it parses as one (the voice speed is `default` or a number). */
  acceptsNumber?: boolean;
};

export interface AdapterType {
  id: AdapterTypeId;
  stage: ProviderStage;
  label: string;
  fields: ParameterField[];
}

/** The stage of each adapter type, kept literal so the video stage's adapter table can be typed by it (JOS-219, Decision 7). */
export const ADAPTER_STAGES = {
  "openai-reasoning": "reasoning",
  "elevenlabs-voice": "voice",
  "elevenlabs-alignment": "alignment",
  "fal-image": "image",
  "runninghub-video": "video",
  "configured-video": "video",
} as const satisfies Record<AdapterTypeId, ProviderStage>;

/** The adapter types of the video stage: a new one does not compile until the video adapter table builds it. */
export type VideoAdapterTypeId = { [Id in AdapterTypeId]: (typeof ADAPTER_STAGES)[Id] extends "video" ? Id : never }[AdapterTypeId];

// key-per-adapter-tables (JOS-262), design Decision 3 — keyed by adapter type, so a new type needs its form here.
const ADAPTER_TYPE_DEFINITIONS: Record<AdapterTypeId, Omit<AdapterType, "id" | "stage">> = {
  "openai-reasoning": {
    label: "OpenAI",
    fields: [{ path: ["model"], label: "Model", kind: "text", required: true, help: "The model identifier used for the script division and the visual instructions." }],
  },
  "elevenlabs-voice": {
    label: "ElevenLabs",
    fields: [
      { path: ["model"], label: "Model", kind: "text", required: true },
      { path: ["voiceId"], label: "Voice id", kind: "text", required: true },
      { path: ["voiceName"], label: "Voice name", kind: "text", required: true, help: "Shown in the interface only." },
      { path: ["outputFormat"], label: "Output format", kind: "text", required: true, help: "For example mp3_44100_128." },
      { path: ["speed"], label: "Speed", kind: "text", required: true, acceptsNumber: true, help: "Write default, or a number from 0.7 to 1.2." },
    ],
  },
  "elevenlabs-alignment": {
    label: "ElevenLabs forced alignment",
    fields: [{ path: ["endpoint"], label: "Endpoint path", kind: "text", required: true, help: "A path on the vendor's host, such as /v1/forced-alignment." }],
  },
  "fal-image": {
    label: "Fal.ai",
    fields: [{ path: ["model"], label: "Model", kind: "text", required: true, help: "For example fal-ai/flux/dev." }],
  },
  "runninghub-video": {
    label: "RunningHub",
    fields: [
      { path: ["endpoint"], label: "Endpoint path", kind: "text", required: true, help: "A path on the vendor's host." },
      { path: ["admittedDurationSeconds", "min"], label: "Shortest clip (seconds)", kind: "number", required: true },
      { path: ["admittedDurationSeconds", "max"], label: "Longest clip (seconds)", kind: "number", required: true },
      { path: ["resolution"], label: "Clip resolution", kind: "choice", required: true, choices: ["768P"], help: "768P (1344×768). 2K is not offered: it costs about 56% more per second." },
    ],
  },
  "configured-video": {
    label: "Configured connector",
    fields: [
      { path: ["baseUrl"], label: "Base URL", kind: "text", required: true, help: "https:// and the vendor's API host, for example https://api.dev.runwayml.com. The key is sent only to this host; changing the host clears the stored key." },
      { path: ["model"], label: "Model", kind: "text", required: true, help: "Fills {model}, for example wan3 or kling_4." },
      { path: ["resolution"], label: "Clip resolution", kind: "text", required: true, help: "Fills {resolution} as the vendor writes it, for example auto_720p or 768P. At most 1080p." },
      { path: ["admittedDurationSeconds", "min"], label: "Shortest clip (seconds)", kind: "number", required: true },
      { path: ["admittedDurationSeconds", "max"], label: "Longest clip (seconds)", kind: "number", required: true },
      { path: ["requests"], label: "Requests (JSON)", kind: "json", required: true, help: "The headers and the upload, submit, poll and check steps. See docs/video-connector-definitions.md for the Runway and RunningHub definitions." },
    ],
  },
};

/** Every adapter type ends with the optional price and currency fields, labelled with its stage's billed unit. */
export const ADAPTER_TYPES: AdapterType[] = Object.entries(ADAPTER_TYPE_DEFINITIONS).map(([id, type]) => ({
  id: id as AdapterTypeId,
  stage: ADAPTER_STAGES[id as AdapterTypeId],
  ...type,
  fields: [
    ...type.fields,
    { path: ["pricePerUnit"], label: `Price per ${BILLED_UNITS[ADAPTER_STAGES[id as AdapterTypeId]].label}`, kind: "number", required: false, help: "Optional. Leave empty if the provider has no price." },
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
