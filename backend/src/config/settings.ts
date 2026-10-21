import { readFileSync } from "node:fs";
import { z } from "zod";

// configure-providers-and-parameters (JOS-174), design Decisions 1, 2, 4 and
// 5 — the settings schema and its loader. `providers.ts` calls `loadSettings`
// once at module load, so a change to a settings file applies after a restart
// and an invalid file stops start-up with every problem listed. Credentials
// never come from here: the schema is strict at every level, so a stray
// `openaiApiKey` is an unknown key, rejected without its value being printed.

/** The adapters this build ships, per stage (Decision 4). Adding an adapter widens its list. */
const ACCEPTED_PROVIDERS = {
  decomposition: ["OpenAI"],
  voice: ["ElevenLabs"],
  alignment: ["ElevenLabs"],
  image: ["Fal.ai"],
  video: ["RunningHub"],
} as const;

const nonEmptyString = z.string().min(1);
const positiveInteger = z.number().int().min(1);
const evenPositiveInteger = positiveInteger.multipleOf(2);
/** A maximum time in seconds, or null for "not timed" (spec stage-execution-time-limit). The key itself is required. */
const maxTimeSeconds = z.number().positive().nullable();

/** ElevenLabs accepts 0.7 to 1.2 (Decision 5). A custom check keeps the rejected value out of the message. */
const voiceSpeed = z.custom<"default" | number>(
  (value) => value === "default" || (typeof value === "number" && value >= 0.7 && value <= 1.2),
  { message: 'must be "default" or a number from 0.7 to 1.2' },
);

const settingsSchema = z
  .strictObject({
    decomposition: z.strictObject({ name: z.enum(ACCEPTED_PROVIDERS.decomposition), model: nonEmptyString }),
    voice: z.strictObject({
      name: z.enum(ACCEPTED_PROVIDERS.voice),
      model: nonEmptyString,
      voiceId: nonEmptyString,
      voiceName: nonEmptyString,
      outputFormat: nonEmptyString,
      speed: voiceSpeed,
    }),
    alignment: z.strictObject({ name: z.enum(ACCEPTED_PROVIDERS.alignment), endpoint: nonEmptyString }),
    image: z.strictObject({ name: z.enum(ACCEPTED_PROVIDERS.image), model: nonEmptyString }),
    video: z.strictObject({
      name: z.enum(ACCEPTED_PROVIDERS.video),
      endpoint: nonEmptyString,
      admittedDurationSeconds: z.strictObject({ min: positiveInteger, max: positiveInteger }),
    }),
    segmentation: z.strictObject({ lowerBoundSeconds: z.number().positive() }),
    /** The unsigned factor, as recorded by JOS-148. */
    speedFactorLimit: z.number().min(1),
    maxTimeSeconds: z.strictObject({
      decomposition: maxTimeSeconds,
      image: maxTimeSeconds,
      voice: maxTimeSeconds,
      alignment: maxTimeSeconds,
      video: maxTimeSeconds,
      assembly: maxTimeSeconds,
    }),
    maxSimultaneousRequests: z.strictObject({
      decomposition: positiveInteger,
      image: positiveInteger,
      voice: positiveInteger,
      alignment: positiveInteger,
      video: positiveInteger,
    }),
    /** Width and height are even because H.264 requires it. */
    output: z.strictObject({ width: evenPositiveInteger, height: evenPositiveInteger, fps: positiveInteger }),
    languages: z.array(z.strictObject({ code: z.string().regex(/^[a-z]{2}$/), label: nonEmptyString })).min(1),
  })
  .superRefine((settings, context) => {
    const { min, max } = settings.video.admittedDurationSeconds;
    if (settings.segmentation.lowerBoundSeconds < min) {
      context.addIssue({
        code: "custom",
        path: ["segmentation", "lowerBoundSeconds"],
        message: "must not be shorter than video.admittedDurationSeconds.min",
      });
    }
    if (min > max) {
      context.addIssue({
        code: "custom",
        path: ["video", "admittedDurationSeconds", "min"],
        message: "must not be greater than video.admittedDurationSeconds.max",
      });
    }
    if (new Set(settings.languages.map((language) => language.code)).size !== settings.languages.length) {
      context.addIssue({ code: "custom", path: ["languages"], message: "language codes must be unique" });
    }
  });

export type Settings = z.infer<typeof settingsSchema>;

export type LoadSettingsResult = { ok: true; settings: Settings } | { ok: false; problems: string[] };

type JsonObject = Record<string, unknown>;

function isPlainObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Objects merge recursively and the override wins; arrays and scalars are replaced whole (Decision 1). */
function deepMerge(base: JsonObject, override: JsonObject): JsonObject {
  const merged: JsonObject = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const current = merged[key];
    merged[key] = isPlainObject(current) && isPlainObject(value) ? deepMerge(current, value) : value;
  }
  return merged;
}

type ReadResult = { kind: "found"; value: unknown } | { kind: "missing" } | { kind: "problem"; problem: string };

/**
 * The reason a file failed is deliberately reduced to a fixed phrase: the text
 * of a `JSON.parse` error quotes part of the file, which could be a secret.
 */
function readJsonFile(path: string): ReadResult {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { kind: "missing" };
    return { kind: "problem", problem: `${path}: the file could not be read` };
  }
  try {
    return { kind: "found", value: JSON.parse(text) };
  } catch {
    return { kind: "problem", problem: `${path}: the file could not be parsed as JSON` };
  }
}

function dottedPath(path: ReadonlyArray<string | number>): string {
  return path.length === 0 ? "settings" : path.join(".");
}

/**
 * Written by issue code, not taken from zod's messages: zod 3 puts the
 * received value in some of them (`received 'Acme'`), and a settings problem
 * must never print a value (design Decision 2).
 */
function describeIssue(issue: z.ZodIssue): string[] {
  const at = dottedPath(issue.path);
  switch (issue.code) {
    case "unrecognized_keys":
      return issue.keys.map((key) => `${dottedPath([...issue.path, key])}: unknown setting`);
    case "invalid_type":
      return [`${at}: ${issue.received === "undefined" ? "is required" : `must be of type ${issue.expected}`}`];
    case "invalid_enum_value":
      return [`${at}: must be one of ${issue.options.join(", ")}`];
    case "too_small":
      if (issue.type === "string") return [`${at}: ${issue.minimum === 1 ? "must not be empty" : `must have at least ${issue.minimum} characters`}`];
      if (issue.type === "array") return [`${at}: must have at least ${issue.minimum} item(s)`];
      return [`${at}: ${issue.inclusive ? `must be at least ${issue.minimum}` : `must be greater than ${issue.minimum}`}`];
    case "too_big":
      return [`${at}: must be at most ${issue.maximum}`];
    case "not_multiple_of":
      return [`${at}: must be a multiple of ${issue.multipleOf}`];
    case "invalid_string":
      return [`${at}: has the wrong format`];
    case "custom":
      return [`${at}: ${issue.message}`];
    default:
      return [`${at}: is invalid`];
  }
}

/**
 * Reads the shipped defaults and the optional per-user override, merges them
 * and validates the result as a whole. Pure apart from reading the two files.
 */
export function loadSettings(options: { defaultsPath: string; overridePath: string }): LoadSettingsResult {
  const problems: string[] = [];

  const defaults = readJsonFile(options.defaultsPath);
  if (defaults.kind === "missing") problems.push(`${options.defaultsPath}: the default settings file does not exist`);
  else if (defaults.kind === "problem") problems.push(defaults.problem);
  else if (!isPlainObject(defaults.value)) problems.push(`${options.defaultsPath}: the file must contain a JSON object`);

  let override: JsonObject = {};
  const overrideRead = readJsonFile(options.overridePath);
  if (overrideRead.kind === "problem") problems.push(overrideRead.problem);
  else if (overrideRead.kind === "found") {
    if (isPlainObject(overrideRead.value)) override = overrideRead.value;
    else problems.push(`${options.overridePath}: the file must contain a JSON object`);
  }

  if (problems.length > 0 || defaults.kind !== "found" || !isPlainObject(defaults.value)) return { ok: false, problems };

  const parsed = settingsSchema.safeParse(deepMerge(defaults.value, override));
  if (!parsed.success) return { ok: false, problems: parsed.error.issues.flatMap(describeIssue) };
  return { ok: true, settings: parsed.data };
}
