import { randomUUID } from "node:crypto";
import { z } from "zod";
import { loadCredential } from "./config/credentials.ts";
import { VIDEO_PROVIDER, VIDEO_GENERATION_SETTING } from "./config/providers.ts";

// generate-chunk-video (JOS-146) — the video stage's provider port (Decision 3):
// RunningHub's async submit-and-poll shape. Unlike Fal.ai's image stage (one
// synchronous round trip), RunningHub requires:
//   1. upload the image (`POST .../media/upload/binary`) to get a URL;
//   2. submit prompt, resolution, duration, firstFrameUrl (`POST .../task/openapi/create`) → taskId;
//   3. poll (`POST .../task/openapi/status`) until SUCCESS|FAILED.

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

const uploadResponseSchema = z.object({
  code: z.number(),
  data: z.object({ fileUrl: z.string().min(1) }),
});

const submitResponseSchema = z.object({
  code: z.number(),
  data: z.object({ taskId: z.string().min(1) }),
});

const queryResponseSchema = z.object({
  code: z.number(),
  data: z.object({
    taskStatus: z.string(),
    outputList: z
      .array(z.object({ fileUrl: z.string().min(1) }))
      .optional(),
  }),
});

export function createRunningHubVideoProvider(
  options: { fetchFn?: typeof fetch; loadKey?: () => string } = {},
): VideoProvider {
  const fetchFn = options.fetchFn ?? fetch;
  const loadKey = options.loadKey ?? (() => loadCredential("RUNNINGHUB_API_KEY"));

  async function doUpload(imageBytes: Buffer, apiKey: string): Promise<{ ok: true; url: string } | { ok: false; kind: "failed_transient" | "failed_not_retryable"; reason: string }> {
    let response: Response;
    try {
      response = await fetchFn(`${RUNNINGHUB_BASE}/openapi/v2/media/upload/binary`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/octet-stream" },
        body: new Uint8Array(imageBytes),
      });
    } catch {
      return { ok: false, kind: "failed_transient", reason: "the video provider could not be reached during image upload" };
    }
    if (!response.ok) {
      return { ok: false, kind: classifyHttpStatus(response.status), reason: `image upload answered HTTP ${response.status}` };
    }
    const parsed = uploadResponseSchema.safeParse(await response.json().catch(() => null));
    if (!parsed.success || parsed.data.code !== 0) {
      return { ok: false, kind: "failed_transient", reason: "the image upload response did not match the expected shape" };
    }
    return { ok: true, url: parsed.data.data.fileUrl };
  }

  return {
    async submit({ imageBytes, instruction, durationSeconds }) {
      let apiKey: string;
      try {
        apiKey = loadKey();
      } catch (err) {
        return { kind: "failed_not_retryable", reason: err instanceof Error ? err.message : "missing credential 'RUNNINGHUB_API_KEY'" };
      }

      const upload = await doUpload(imageBytes, apiKey);
      if (!upload.ok) return { kind: upload.kind, reason: upload.reason };

      let response: Response;
      try {
        response = await fetchFn(`${RUNNINGHUB_BASE}/openapi/v2/task/openapi/create`, {
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

      const parsed = submitResponseSchema.safeParse(await response.json().catch(() => null));
      if (!parsed.success || parsed.data.code !== 0) {
        return { kind: "failed_transient", reason: "the task submission response did not match the expected shape" };
      }

      return { kind: "submitted", requestId: parsed.data.data.taskId };
    },

    async poll(requestId) {
      let apiKey: string;
      try {
        apiKey = loadKey();
      } catch (err) {
        return { kind: "failed_not_retryable", reason: err instanceof Error ? err.message : "missing credential 'RUNNINGHUB_API_KEY'" };
      }

      let response: Response;
      try {
        response = await fetchFn(`${RUNNINGHUB_BASE}/openapi/v2/task/openapi/status`, {
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

      const parsed = queryResponseSchema.safeParse(await response.json().catch(() => null));
      if (!parsed.success || parsed.data.code !== 0) {
        return { kind: "failed_transient", reason: "the poll response did not match the expected shape" };
      }

      const status = parsed.data.data.taskStatus;
      if (status === "SUCCESS") {
        const url = parsed.data.data.outputList?.[0]?.fileUrl;
        if (!url) return { kind: "failed_transient", reason: "the video provider returned SUCCESS but no result URL" };
        return { kind: "success", clip: { source: "temporary-url", url } };
      }
      if (status === "FAILED") {
        // JOS-165: NOT_RETRYABLE_FAILURE_SIGNAL_CONFIRMED = false — no distinguishable signal.
        return { kind: "failed_transient", reason: "the video provider task ended in FAILED" };
      }
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
    async submit({ instruction }) {
      calls.push(instruction);
      // Unique across restarts, like a real provider task id: `provider_requests.id` is a primary key and survives a restart.
      const requestId = `stub-video-req-${randomUUID()}`;
      submitted.set(requestId, mode);
      return { kind: "submitted", requestId };
    },
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
}

function defaultRegistry(): VideoProviderRegistry {
  return {
    defaultIdentifier: VIDEO_PROVIDER.endpoint,
    adapters: { [VIDEO_PROVIDER.endpoint]: createRunningHubVideoProvider() },
  };
}

let registry: VideoProviderRegistry = defaultRegistry();

export function getVideoProviderRegistry(): VideoProviderRegistry {
  return registry;
}

export function setVideoProviderRegistry(next: VideoProviderRegistry): void {
  registry = next;
}

export function resetVideoProviderRegistry(): void {
  registry = defaultRegistry();
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
