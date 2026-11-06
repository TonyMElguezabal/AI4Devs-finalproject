import { sniffImageExtension } from "./imageOutputCheck.ts";
import type { VideoGenerationResult, VideoProvider, VideoSubmitResult } from "./videoProvider.ts";

// configurable-video-connector (JOS-219), design Decisions 1-5 — one video adapter whose requests come from a definition the
// Administrator writes on /admin. It runs the video stage's submit-and-poll port, so binding, retries, time limits, restart
// recovery and the reports work for it unchanged. Every request goes to the profile's base URL with one of the definition's
// paths, with no retry of its own; the key travels only in the definition's headers (validated in providerTypes.ts).

interface ConnectorStep {
  method?: "GET" | "POST";
  path: string;
  body?: unknown;
  errorAt?: string;
  okErrorValues?: unknown[];
}

export interface ConnectorRequests {
  headers: Record<string, string>;
  upload?: ConnectorStep & { multipartField: string; urlAt: string };
  submit: ConnectorStep & { taskIdAt: string };
  poll: ConnectorStep & { statusAt: string; doneWhen: string[]; failedWhen: string[]; videoUrlAt: string; notFoundStatus?: number };
  check?: ConnectorStep & { connectedStatus?: number; charged?: boolean };
}

export interface ConfiguredVideoParameters {
  baseUrl: string;
  model: string;
  resolution: string;
  requests: ConnectorRequests;
}

type Values = Record<string, string | number>;

/** A 4xx other than 408 and 429 is the request's fault and is not retried; everything else may pass (the shared rule). */
export function classifyHttpStatus(status: number): "failed_transient" | "failed_not_retryable" {
  return status >= 400 && status < 500 && status !== 408 && status !== 429 ? "failed_not_retryable" : "failed_transient";
}

/** Reads `results[0].url` from an answer: dots and `[n]`, nothing evaluated (Decision 2). */
export function readPath(body: unknown, path: string): unknown {
  return path
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter((part) => part !== "")
    .reduce<unknown>((value, part) => (typeof value === "object" && value !== null ? (value as Record<string, unknown>)[part] : undefined), body);
}

const WHOLE_PLACEHOLDER = /^\{([a-z0-9_]+)\}$/;
const PLACEHOLDER = /\{([a-z0-9_]+)\}/g;

/** Fills a template: a string that is one placeholder takes the typed value, a placeholder inside text is replaced as text. */
function fill(template: unknown, values: Values, encode = false): unknown {
  if (typeof template === "string") {
    const whole = WHOLE_PLACEHOLDER.exec(template);
    if (whole && !encode && whole[1]! in values) return values[whole[1]!];
    return template.replace(PLACEHOLDER, (match, name: string) => (name in values ? (encode ? encodeURIComponent(String(values[name])) : String(values[name])) : match));
  }
  if (Array.isArray(template)) return template.map((item) => fill(item, values, encode));
  if (typeof template === "object" && template !== null) return Object.fromEntries(Object.entries(template).map(([key, value]) => [key, fill(value, values, encode)]));
  return template;
}

/** A vendor value as text for a reason or a comparison; objects are written as JSON, never as [object Object]. */
const asText = (value: unknown): string => (typeof value === "string" ? value : JSON.stringify(value));

const textOf = (value: unknown): string | undefined => (typeof value === "string" && value !== "" ? value : typeof value === "number" ? String(value) : undefined);

type Failure = { kind: "failed_transient"; reason: string; unresponsive?: true } | { kind: "failed_not_retryable"; reason: string };
type Answer = { ok: true; status: number; body: unknown } | { ok: false; status?: number; failure: Failure };

export function createConfiguredVideoProvider(options: { fetchFn?: typeof fetch; loadKey: () => string; parameters: Record<string, unknown> }): VideoProvider {
  const fetchFn = options.fetchFn ?? fetch;
  const { baseUrl, model, resolution, requests } = options.parameters as unknown as ConfiguredVideoParameters;
  const base = baseUrl.replace(/\/$/, "");

  /** One request of one step. A non-2xx reason names the step and the status only: a vendor's body can echo the key. */
  async function send(stepName: string, step: ConnectorStep, values: Values, key: string, body?: FormData): Promise<Answer> {
    const headers = fill(requests.headers, { ...values, key }) as Record<string, string>;
    const init: RequestInit = { method: body ? "POST" : (step.method ?? "POST"), headers };
    if (body) init.body = body;
    else if (step.body !== undefined) {
      init.headers = { ...headers, "Content-Type": "application/json" };
      init.body = JSON.stringify(fill(step.body, values));
    }
    let response: Response;
    try {
      response = await fetchFn(`${base}${String(fill(step.path, values, true))}`, init);
    } catch {
      return { ok: false, failure: { kind: "failed_transient", reason: `the video provider could not be reached during the ${stepName} step`, unresponsive: true } };
    }
    if (!response.ok) return { ok: false, status: response.status, failure: { kind: classifyHttpStatus(response.status), reason: `the ${stepName} step answered HTTP ${response.status}` } };
    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch {
      return { ok: false, failure: { kind: "failed_transient", reason: `the ${stepName} step's answer was not JSON` } };
    }
    if (step.errorAt) {
      const code = readPath(parsed, step.errorAt);
      const okValues = step.okErrorValues ?? ["", null];
      if (code !== undefined && !okValues.includes(code)) {
        // The vendor's own code, never its message, and never the key even if a vendor echoes it as a code.
        return { ok: false, failure: { kind: "failed_transient", reason: `the ${stepName} step failed (error ${asText(code).split(key).join("***").slice(0, 120)})` } };
      }
    }
    return { ok: true, status: response.status, body: parsed };
  }

  const missing = (stepName: string, path: string): Failure => ({ kind: "failed_transient", reason: `the ${stepName} step's answer had no value at ${path}` });

  function loadKeyOrFail(): { key: string } | { failure: Failure } {
    try {
      return { key: options.loadKey() };
    } catch (err) {
      return { failure: { kind: "failed_not_retryable", reason: err instanceof Error ? err.message : "missing API key for the video role" } };
    }
  }

  return {
    async submit({ imageBytes, instruction, durationSeconds }): Promise<VideoSubmitResult> {
      const loaded = loadKeyOrFail();
      if ("failure" in loaded) return loaded.failure;
      const imageBase64 = imageBytes.toString("base64");
      // The image's real type: Runway refuses a JPEG labelled PNG ("Failed to fetch image metadata").
      const [imageType, extension] = sniffImageExtension(imageBytes) === "jpg" ? ["image/jpeg", "jpg"] : ["image/png", "png"];
      const values: Values = { instruction, duration: durationSeconds, model, resolution, image_base64: imageBase64, image_data_uri: `data:${imageType};base64,${imageBase64}` };

      if (requests.upload) {
        const form = new FormData();
        form.append(requests.upload.multipartField, new Blob([new Uint8Array(imageBytes)], { type: imageType }), `frame.${extension}`);
        const uploaded = await send("upload", requests.upload, values, loaded.key, form);
        if (!uploaded.ok) return uploaded.failure;
        const url = textOf(readPath(uploaded.body, requests.upload.urlAt));
        if (!url) return missing("upload", requests.upload.urlAt);
        values.image_url = url;
      }

      const submitted = await send("submit", requests.submit, values, loaded.key);
      if (!submitted.ok) return submitted.failure;
      const taskId = textOf(readPath(submitted.body, requests.submit.taskIdAt));
      if (!taskId) return missing("submit", requests.submit.taskIdAt);
      // The keys allowListVideoRequest reads: never the image data or the key (Decision 3).
      return { kind: "submitted", requestId: taskId, sentBody: { prompt: instruction, duration: durationSeconds, resolution } };
    },

    async poll(requestId): Promise<VideoGenerationResult> {
      const loaded = loadKeyOrFail();
      if ("failure" in loaded) return loaded.failure;
      const { poll } = requests;
      const answer = await send("poll", { method: "GET", ...poll }, { model, resolution, task_id: requestId }, loaded.key);
      if (!answer.ok) return answer.status !== undefined && answer.status === poll.notFoundStatus ? { kind: "not_found" } : answer.failure;
      const status = readPath(answer.body, poll.statusAt);
      if (status === undefined || status === null) return missing("poll", poll.statusAt);
      const statusText = asText(status);
      if (poll.doneWhen.includes(statusText)) {
        const url = textOf(readPath(answer.body, poll.videoUrlAt));
        return url ? { kind: "success", clip: { source: "temporary-url", url } } : missing("poll", poll.videoUrlAt);
      }
      if (poll.failedWhen.includes(statusText)) {
        // NOT_RETRYABLE_FAILURE_SIGNAL_CONFIRMED is false: a failed task stays transient (Decision 4).
        return { kind: "failed_transient", reason: `the video task ended in ${statusText}` };
      }
      return { kind: "pending" };
    },
  };
}

/** The connection check of a connector: its own check step, one request, the key in its headers (Decision 7). */
export async function runConnectorCheck(
  parameters: Record<string, unknown>,
  key: string,
  fetchFn: typeof fetch,
  signal: AbortSignal,
): Promise<{ outcome: "connected" | "key-rejected" | "unreachable" | "unexpected" | "no-check"; httpStatus?: number }> {
  const { baseUrl, model, resolution, requests } = parameters as unknown as ConfiguredVideoParameters;
  if (!requests.check) return { outcome: "no-check" };
  const values = { model, resolution, key };
  let response: Response;
  try {
    response = await fetchFn(`${baseUrl.replace(/\/$/, "")}${String(fill(requests.check.path, values, true))}`, {
      method: requests.check.method ?? "GET",
      headers: fill(requests.headers, values) as Record<string, string>,
      signal,
    });
  } catch {
    return { outcome: "unreachable" };
  }
  if (requests.check.connectedStatus === undefined ? response.ok : response.status === requests.check.connectedStatus) return { outcome: "connected" };
  if (response.status === 401 || response.status === 403) return { outcome: "key-rejected" };
  return { outcome: "unexpected", httpStatus: response.status };
}
