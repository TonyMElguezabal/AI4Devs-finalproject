import { randomUUID } from "node:crypto";
import { z } from "zod";
import { keyFor, stageApiKey } from "./keyStore.ts";
import { buildProfileRegistry, profileRegistrySlot } from "./profileRegistry.ts";
import { LEGACY_VIDEO_PROVIDER_IDENTIFIER, VIDEO_PROVIDER, VIDEO_GENERATION_SETTING } from "./config/providers.ts";

// generate-chunk-video (JOS-146) — the video stage's provider port (Decision 3):
// RunningHub's async submit-and-poll shape. Unlike Fal.ai's image stage (one
// synchronous round trip), RunningHub requires, in the shapes the live service
// accepts (fix-runninghub-adapter, JOS-196; checked 2026-10-13):
//   1. upload the image as a multipart `file` (`POST .../media/upload/binary`) → `data.download_url`;
//   2. submit prompt, resolution, duration, firstFrameUrl (`POST` to `VIDEO_PROVIDER.endpoint`) → top-level `taskId`;
//   3. poll (`POST .../openapi/v2/query`) until `status` is SUCCESS (`results[0].url`) or FAILED.

/** What a successful generation returns. */
export type GeneratedClip =
  | { source: "bytes"; bytes: Buffer }
  | { source: "temporary-url"; url: string };

/** Result of a `submit` call. */
export type VideoSubmitResult =
  | { kind: "submitted"; requestId: string }
  | { kind: "failed_transient"; reason: string }
  | { kind: "failed_not_retryable"; reason: string };

/** Result of a `poll` call. */
export type VideoGenerationResult =
  | { kind: "success"; clip: GeneratedClip }
  | { kind: "pending" }
  | { kind: "not_found" }
  | { kind: "failed_transient"; reason: string }
  | { kind: "failed_not_retryable"; reason: string };

export interface VideoProvider {
  submit(params: { imageBytes: Buffer; instruction: string; durationSeconds: number }): Promise<VideoSubmitResult>;
  poll(requestId: string): Promise<VideoGenerationResult>;
}

const RUNNINGHUB_BASE = "https://www.runninghub.ai";

function classifyHttpStatus(status: number): "failed_transient" | "failed_not_retryable" {
  return status >= 400 && status < 500 && status !== 408 && status !== 429 ? "failed_not_retryable" : "failed_transient";
}

/** The upload answer: `{ code: 0, msg: "success", data: { download_url } }`, or the flat task envelope with an `errorCode`. */
const uploadResponseSchema = z.object({
  code: z.number().optional(),
  msg: z.string().nullish(),
  errorCode: z.union([z.string(), z.number()]).nullish(),
  errorMessage: z.string().nullish(),
  data: z.object({ download_url: z.string().min(1) }).partial().nullish(),
});

/** The flat envelope of a submit and a query answer; `data.taskId` is tolerated as the earlier scripts did. */
const taskResponseSchema = z.object({
  code: z.number().optional(),
  taskId: z.string().nullish(),
  status: z.string().nullish(),
  errorCode: z.union([z.string(), z.number()]).nullish(),
  errorMessage: z.string().nullish(),
  results: z.array(z.object({ url: z.string().nullish() })).nullish(),
  data: z.object({ taskId: z.string().nullish() }).partial().nullish(),
});

/** A readable reason for a provider error envelope: the step and the provider's own code, never a credential. */
function providerErrorReason(step: string, envelope: { code?: number | undefined; errorCode?: string | number | null | undefined; errorMessage?: string | null | undefined; msg?: string | null | undefined }): string | undefined {
  const code = envelope.errorCode !== undefined && envelope.errorCode !== null && String(envelope.errorCode) !== "" ? String(envelope.errorCode) : undefined;
  const failedCode = envelope.code !== undefined && envelope.code !== 0 ? String(envelope.code) : undefined;
  if (code === undefined && failedCode === undefined) return undefined;
  const message = (envelope.errorMessage || envelope.msg || "").trim().slice(0, 120);
  return `${step} failed${message ? `: ${message}` : ""} (error ${code ?? failedCode})`;
}

export function createRunningHubVideoProvider(
  options: { fetchFn?: typeof fetch; loadKey?: () => string; parameters?: { endpoint: string } } = {},
): VideoProvider {
  const fetchFn = options.fetchFn ?? fetch;
  // manage-providers-from-admin (JOS-218): the endpoint path comes from the profile; without one, the settings' video endpoint.
  const endpoint = (options.parameters ?? { endpoint: VIDEO_PROVIDER.endpoint }).endpoint;
  const loadKey = options.loadKey ?? (() => stageApiKey("video"));

  async function doUpload(imageBytes: Buffer, apiKey: string): Promise<{ ok: true; url: string } | { ok: false; kind: "failed_transient" | "failed_not_retryable"; reason: string }> {
    // multipart/form-data with a `file` part; the content type (with its boundary) is set by the form, not by us.
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(imageBytes)], { type: "image/png" }), "frame.png");
    let response: Response;
    try {
      response = await fetchFn(`${RUNNINGHUB_BASE}/openapi/v2/media/upload/binary`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
      });
    } catch {
      return { ok: false, kind: "failed_transient", reason: "the video provider could not be reached during image upload" };
    }
    if (!response.ok) {
      return { ok: false, kind: classifyHttpStatus(response.status), reason: `image upload answered HTTP ${response.status}` };
    }
    const parsed = uploadResponseSchema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) {
      return { ok: false, kind: "failed_transient", reason: "the image upload response did not match the expected shape" };
    }
    const providerError = providerErrorReason("image upload", parsed.data);
    if (providerError) return { ok: false, kind: "failed_transient", reason: providerError };
    const url = parsed.data.data?.download_url;
    if (!url) return { ok: false, kind: "failed_transient", reason: "the image upload response had no download URL" };
    return { ok: true, url };
  }

  return {
    async submit({ imageBytes, instruction, durationSeconds }) {
      let apiKey: string;
      try {
        apiKey = loadKey();
      } catch (err) {
        return { kind: "failed_not_retryable", reason: err instanceof Error ? err.message : "missing API key for the video role" };
      }

      const upload = await doUpload(imageBytes, apiKey);
      if (!upload.ok) return { kind: upload.kind, reason: upload.reason };

      let response: Response;
      try {
        response = await fetchFn(`${RUNNINGHUB_BASE}${endpoint}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: instruction,
            duration: durationSeconds,
            resolution: VIDEO_GENERATION_SETTING.resolution,
            firstFrameUrl: upload.url,
          }),
        });
      } catch {
        return { kind: "failed_transient", reason: "the video provider could not be reached during task submission" };
      }

      if (!response.ok) {
        return { kind: classifyHttpStatus(response.status), reason: `task submission answered HTTP ${response.status}` };
      }

      const parsed = taskResponseSchema.safeParse(await response.json().catch(() => null));
      if (!parsed.success) {
        return { kind: "failed_transient", reason: "the task submission response did not match the expected shape" };
      }
      const providerError = providerErrorReason("task submission", parsed.data);
      if (providerError) return { kind: "failed_transient", reason: providerError };
      const taskId = parsed.data.taskId || parsed.data.data?.taskId;
      if (!taskId) return { kind: "failed_transient", reason: "the task submission response had no task id" };

      return { kind: "submitted", requestId: taskId };
    },

    async poll(requestId) {
      let apiKey: string;
      try {
        apiKey = loadKey();
      } catch (err) {
        return { kind: "failed_not_retryable", reason: err instanceof Error ? err.message : "missing API key for the video role" };
      }

      let response: Response;
      try {
        response = await fetchFn(`${RUNNINGHUB_BASE}/openapi/v2/query`, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ taskId: requestId }),
        });
      } catch {
        return { kind: "failed_transient", reason: "the video provider could not be reached during polling" };
      }

      if (!response.ok) {
        return { kind: classifyHttpStatus(response.status), reason: `poll answered HTTP ${response.status}` };
      }

      const parsed = taskResponseSchema.safeParse(await response.json().catch(() => null));
      if (!parsed.success) {
        return { kind: "failed_transient", reason: "the poll response did not match the expected shape" };
      }

      const status = parsed.data.status;
      if (status === "SUCCESS") {
        const url = parsed.data.results?.[0]?.url;
        if (!url) return { kind: "failed_transient", reason: "the video provider returned SUCCESS but no result URL" };
        return { kind: "success", clip: { source: "temporary-url", url } };
      }
      if (status === "FAILED") {
        // JOS-165: NOT_RETRYABLE_FAILURE_SIGNAL_CONFIRMED = false — no distinguishable signal.
        return { kind: "failed_transient", reason: providerErrorReason("the video task", parsed.data) ?? "the video provider task ended in FAILED" };
      }
      const providerError = providerErrorReason("polling", parsed.data);
      if (providerError && !status) return { kind: "failed_transient", reason: providerError };
      // QUEUED, RUNNING, or any other status → still pending
      return { kind: "pending" };
    },
  };
}

export type StubVideoProviderMode =
  | "success-bytes"
  | "success-temporary-url"
  | "transient-failure"
  | "not-retryable-failure"
  | "pending"
  | "request-lost";

export function createStubVideoProvider(
  mode: StubVideoProviderMode,
  options: { bytes?: Buffer; url?: string } = {},
): VideoProvider & { calls: string[] } {
  const calls: string[] = [];
  const submitted = new Map<string, StubVideoProviderMode>();

  return {
    calls,
    // eslint-disable-next-line @typescript-eslint/require-await -- implements the async video provider contract
    async submit({ instruction }) {
      calls.push(instruction);
      // Unique across restarts, like a real provider task id: `provider_requests.id` is a primary key and survives a restart.
      const requestId = `stub-video-req-${randomUUID()}`;
      submitted.set(requestId, mode);
      return { kind: "submitted", requestId };
    },
    // eslint-disable-next-line @typescript-eslint/require-await -- implements the async video provider contract
    async poll(requestId) {
      // An id from before a restart is unknown to this in-memory map; answer it from the mode.
      const m = submitted.get(requestId) ?? mode;
      switch (m) {
        case "success-bytes":
          return { kind: "success", clip: { source: "bytes", bytes: options.bytes ?? Buffer.alloc(0) } };
        case "success-temporary-url":
          return { kind: "success", clip: { source: "temporary-url", url: options.url ?? "https://cdn.example.com/stub.mp4" } };
        case "transient-failure":
          return { kind: "failed_transient", reason: "stub: transient video provider error" };
        case "not-retryable-failure":
          return { kind: "failed_not_retryable", reason: "stub: not-retryable video provider error" };
        case "pending":
          return { kind: "pending" };
        case "request-lost":
          return { kind: "not_found" };
      }
    },
  };
}

// ---- Registry (mirrors imageProvider.ts, Decision 7) ----

export const STUB_VIDEO_PROVIDER_NAME = "stub-video-provider";

export interface VideoProviderRegistry {
  defaultIdentifier: string;
  adapters: Record<string, VideoProvider>;
  labels?: Record<string, string>;
  aliases?: readonly string[];
  retired?: readonly string[];
}

function defaultRegistry(): VideoProviderRegistry {
  // manage-providers-from-admin (JOS-218): one adapter per video profile, with the profile's endpoint path and its own key.
  return buildProfileRegistry("video", (profile) =>
    createRunningHubVideoProvider({ parameters: profile.parameters as { endpoint: string }, loadKey: () => keyFor(profile.id) }),
  );
}

const slot = profileRegistrySlot<VideoProvider, VideoProviderRegistry>(defaultRegistry);

export function getVideoProviderRegistry(): VideoProviderRegistry {
  return slot.get();
}

export function setVideoProviderRegistry(next: VideoProviderRegistry): void {
  slot.set(next);
}

export function resetVideoProviderRegistry(): void {
  slot.reset();
}

// §12.2 — temporary links are resolved to bytes before success.
let videoDownloadFetch: typeof fetch = fetch;

export function setVideoDownloadFetch(fetchFn: typeof fetch): void {
  videoDownloadFetch = fetchFn;
}

export function resetVideoDownloadFetch(): void {
  videoDownloadFetch = fetch;
}

export type VideoDownloadResult = { ok: true; bytes: Buffer } | { ok: false; reason: string };

export async function downloadGeneratedClip(url: string): Promise<VideoDownloadResult> {
  let response: Response;
  try {
    response = await videoDownloadFetch(url);
  } catch {
    return { ok: false, reason: "the generated clip could not be downloaded" };
  }
  if (!response.ok) {
    return { ok: false, reason: `downloading the generated clip answered HTTP ${response.status}` };
  }
  return { ok: true, bytes: Buffer.from(await response.arrayBuffer()) };
}
