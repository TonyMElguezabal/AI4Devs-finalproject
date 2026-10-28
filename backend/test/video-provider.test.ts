import { randomUUID } from "node:crypto";
import { describe, expect, it, beforeEach } from "vitest";
import { VIDEO_PROVIDER } from "../src/config/providers.ts";
import {
  createStubVideoProvider,
  createRunningHubVideoProvider,
  downloadGeneratedClip,
  resetVideoDownloadFetch,
  setVideoDownloadFetch,
} from "../src/videoProvider.ts";

// generate-chunk-video (JOS-146), group 3 — Decision 3: the VideoProvider port
// with an async submit/poll shape; stub covers all test modes; RunningHub
// adapter is tested against a mocked HTTP layer.

const TEST_BYTES = Buffer.from("fake-mp4-bytes");
const VALID_IMAGE = Buffer.from("fake-image-bytes");

describe("StubVideoProvider (Decision 3 — covers all outcome modes)", () => {
  // harden-backend-foundation (JOS-186) 3.5 — after a restart the stub's in-memory
  // map is empty, so a request id submitted before it is answered from the mode.
  describe("a request id it never saw (submitted before a restart)", () => {
    it("is answered with the configured mode", async () => {
      const bytes = Buffer.from("fake-mp4-bytes");
      expect(await createStubVideoProvider("success-bytes", { bytes }).poll("sent-before-restart")).toEqual({
        kind: "success",
        clip: { source: "bytes", bytes },
      });
      expect(await createStubVideoProvider("pending").poll("sent-before-restart")).toEqual({ kind: "pending" });
      expect((await createStubVideoProvider("transient-failure").poll("sent-before-restart")).kind).toBe("failed_transient");
    });

    it("never hands out a request id that an earlier process lifetime already used", async () => {
      const params = { imageBytes: VALID_IMAGE, instruction: "animate", durationSeconds: 8 };
      const beforeRestart = await createStubVideoProvider("pending").submit(params);
      const afterRestart = await createStubVideoProvider("pending").submit(params);

      expect(beforeRestart.kind === "submitted" && afterRestart.kind === "submitted").toBe(true);
      if (beforeRestart.kind === "submitted" && afterRestart.kind === "submitted") {
        expect(afterRestart.requestId).not.toBe(beforeRestart.requestId);
      }
    });

    it("stays not_found in request-lost mode", async () => {
      expect(await createStubVideoProvider("request-lost").poll("sent-before-restart")).toEqual({ kind: "not_found" });
    });
  });

  describe("success-bytes mode", () => {
    it("submit returns a requestId", async () => {
      const provider = createStubVideoProvider("success-bytes");
      const result = await provider.submit({
        imageBytes: VALID_IMAGE,
        instruction: "animate the harbor",
        durationSeconds: 8,
      });
      expect(result.kind).toBe("submitted");
      if (result.kind === "submitted") expect(result.requestId).toBeTruthy();
    });

    it("poll returns success with bytes", async () => {
      const provider = createStubVideoProvider("success-bytes", { bytes: TEST_BYTES });
      const submit = await provider.submit({ imageBytes: VALID_IMAGE, instruction: "animate", durationSeconds: 8 });
      if (submit.kind !== "submitted") throw new Error("expected submitted");
      const poll = await provider.poll(submit.requestId);
      expect(poll.kind).toBe("success");
      if (poll.kind === "success" && poll.clip.source === "bytes") {
        expect(poll.clip.bytes).toEqual(TEST_BYTES);
      }
    });
  });

  describe("success-temporary-url mode", () => {
    it("poll returns success with a temporary url", async () => {
      const provider = createStubVideoProvider("success-temporary-url", {
        url: "https://cdn.example.com/clip.mp4",
      });
      const submit = await provider.submit({ imageBytes: VALID_IMAGE, instruction: "animate", durationSeconds: 8 });
      if (submit.kind !== "submitted") throw new Error("expected submitted");
      const poll = await provider.poll(submit.requestId);
      expect(poll.kind).toBe("success");
      if (poll.kind === "success" && poll.clip.source === "temporary-url") {
        expect(poll.clip.url).toBe("https://cdn.example.com/clip.mp4");
      }
    });
  });

  describe("transient-failure mode", () => {
    it("submit succeeds; poll returns failed_transient", async () => {
      const provider = createStubVideoProvider("transient-failure");
      const submit = await provider.submit({ imageBytes: VALID_IMAGE, instruction: "animate", durationSeconds: 8 });
      if (submit.kind !== "submitted") throw new Error("expected submitted");
      const poll = await provider.poll(submit.requestId);
      expect(poll.kind).toBe("failed_transient");
    });
  });

  describe("not-retryable-failure mode", () => {
    it("submit succeeds; poll returns failed_not_retryable", async () => {
      const provider = createStubVideoProvider("not-retryable-failure");
      const submit = await provider.submit({ imageBytes: VALID_IMAGE, instruction: "animate", durationSeconds: 8 });
      if (submit.kind !== "submitted") throw new Error("expected submitted");
      const poll = await provider.poll(submit.requestId);
      expect(poll.kind).toBe("failed_not_retryable");
    });
  });

  describe("pending mode", () => {
    it("poll returns pending before resolution", async () => {
      const provider = createStubVideoProvider("pending");
      const submit = await provider.submit({ imageBytes: VALID_IMAGE, instruction: "animate", durationSeconds: 8 });
      if (submit.kind !== "submitted") throw new Error("expected submitted");
      const poll = await provider.poll(submit.requestId);
      expect(poll.kind).toBe("pending");
    });
  });

  describe("request-lost mode", () => {
    it("poll returns not_found for a lost request", async () => {
      const provider = createStubVideoProvider("request-lost");
      const submit = await provider.submit({ imageBytes: VALID_IMAGE, instruction: "animate", durationSeconds: 8 });
      if (submit.kind !== "submitted") throw new Error("expected submitted");
      const poll = await provider.poll(submit.requestId);
      expect(poll.kind).toBe("not_found");
    });
  });

  it("records calls in the calls list", async () => {
    const provider = createStubVideoProvider("success-bytes");
    await provider.submit({ imageBytes: VALID_IMAGE, instruction: "my instruction", durationSeconds: 10 });
    expect(provider.calls).toEqual(["my instruction"]);
  });
});

describe("RunningHub adapter (JOS-196 — the live API's request and answer shapes, tested against mocked HTTP)", () => {
  beforeEach(() => {
    resetVideoDownloadFetch();
  });

  const json = (body: unknown): Response =>
    new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

  /** The upload answer RunningHub gives on success (checked against the live service, 2026-10-13). */
  const uploadAnswer = (url: string): Response =>
    json({ code: 0, msg: "success", errorMessages: null, data: { type: "image", download_url: url, fileName: "frame.png", size: "1" } });

  /** The flat envelope of a submit or a query answer. */
  const taskAnswer = (fields: Record<string, unknown>): Response =>
    json({ taskId: "", status: "", errorCode: "", errorMessage: "", results: null, clientId: "", ...fields });

  const provider = (fetchFn: (url: string, options?: RequestInit) => Promise<Response>) =>
    createRunningHubVideoProvider({ fetchFn: fetchFn as typeof fetch, loadKey: () => "test-api-key" });

  const submitArgs = { imageBytes: VALID_IMAGE, instruction: "animate the scene", durationSeconds: 8 } as const;

  it("submit: uploads the image as a multipart file part and sends prompt, duration, resolution and firstFrameUrl to the model endpoint", async () => {
    const calls: { url: string; options?: RequestInit }[] = [];
    const taskId = randomUUID();
    const uploadUrl = "https://cdn.runninghub.io/img/abc.png";

    const result = await provider(async (url, options) => {
      calls.push({ url, options });
      if (url.includes("/media/upload")) return uploadAnswer(uploadUrl);
      if (url.endsWith(VIDEO_PROVIDER.endpoint)) return taskAnswer({ taskId, status: "QUEUED" });
      return new Response("unexpected", { status: 404 });
    }).submit(submitArgs);

    // show-video-request-status (JOS-200): the result also reports the body it sent, for the request view.
    expect(result).toEqual({
      kind: "submitted",
      requestId: taskId,
      sentBody: { prompt: "animate the scene", duration: 8, resolution: "2K", firstFrameUrl: uploadUrl },
    });

    const upload = calls.find((c) => c.url.includes("/media/upload"));
    expect(upload).toBeTruthy();
    expect(upload!.options?.body).toBeInstanceOf(FormData);
    const file = (upload!.options!.body as FormData).get("file");
    expect(file).toBeInstanceOf(Blob);
    expect(Buffer.from(await (file as Blob).arrayBuffer()).equals(VALID_IMAGE)).toBe(true);
    const uploadHeaders = new Headers(upload!.options?.headers);
    expect(uploadHeaders.get("authorization")).toBe("Bearer test-api-key");
    expect(uploadHeaders.get("content-type")).toBeNull(); // multipart sets its own boundary

    const submitCall = calls.find((c) => c.url.endsWith(VIDEO_PROVIDER.endpoint));
    expect(submitCall).toBeTruthy();
    const body = JSON.parse(submitCall!.options?.body as string);
    expect(body.prompt).toBe("animate the scene");
    expect(body.duration).toBe(8);
    expect(body.resolution).toBe("2K");
    expect(body.firstFrameUrl).toBe(uploadUrl);
  });

  it("submit: reads the task id from data.taskId when the answer nests it", async () => {
    const result = await provider(async (url) => {
      if (url.includes("/media/upload")) return uploadAnswer("https://cdn.runninghub.io/img/abc.png");
      return json({ code: 0, data: { taskId: "nested-1" } });
    }).submit(submitArgs);

    expect(result).toMatchObject({ kind: "submitted", requestId: "nested-1" });
  });

  it("submit: an upload answered with an error envelope is transient, names the upload and carries the error code", async () => {
    const calls: string[] = [];
    const result = await provider(async (url) => {
      calls.push(url);
      return taskAnswer({ errorCode: "1000", errorMessage: "Unknown error, please retry or contact support" });
    }).submit(submitArgs);

    expect(result.kind).toBe("failed_transient");
    if (result.kind !== "failed_transient") throw new Error("unreachable");
    expect(result.reason).toMatch(/image upload/i);
    expect(result.reason).toContain("1000");
    expect(result.reason).not.toContain("test-api-key");
    expect(calls).toHaveLength(1); // no task is created after a failed upload
  });

  it("submit: a refused task submission is transient, names the submission and carries the error code", async () => {
    const result = await provider(async (url) => {
      if (url.includes("/media/upload")) return uploadAnswer("https://cdn.runninghub.io/img/abc.png");
      return taskAnswer({ errorCode: "1002", errorMessage: "invalid parameter" });
    }).submit(submitArgs);

    expect(result.kind).toBe("failed_transient");
    if (result.kind !== "failed_transient") throw new Error("unreachable");
    expect(result.reason).toMatch(/task submission/i);
    expect(result.reason).toContain("1002");
  });

  it("poll: posts the task id to the query endpoint", async () => {
    const calls: { url: string; options?: RequestInit }[] = [];
    await provider(async (url, options) => {
      calls.push({ url, options });
      return taskAnswer({ taskId: "T1", status: "QUEUED" });
    }).poll("T1");

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://www.runninghub.ai/openapi/v2/query");
    expect(calls[0]!.options?.method).toBe("POST");
    expect(JSON.parse(calls[0]!.options?.body as string)).toEqual({ taskId: "T1" });
  });

  it.each(["QUEUED", "RUNNING", "SOMETHING_ELSE"])("poll: maps %s to pending", async (status) => {
    const poll = await provider(async () => taskAnswer({ taskId: "T1", status })).poll("T1");

    expect(poll.kind).toBe("pending");
  });

  it("poll: maps SUCCESS with results[0].url to a temporary-url success", async () => {
    const resultUrl = "https://cdn.runninghub.io/output/clip.mp4";

    const poll = await provider(async () =>
      taskAnswer({ taskId: "T1", status: "SUCCESS", results: [{ url: resultUrl, outputType: "mp4" }] }),
    ).poll("T1");

    expect(poll).toEqual({ kind: "success", clip: { source: "temporary-url", url: resultUrl } });
  });

  it("poll: SUCCESS without a result url is transient", async () => {
    const poll = await provider(async () => taskAnswer({ taskId: "T1", status: "SUCCESS", results: null })).poll("T1");

    expect(poll.kind).toBe("failed_transient");
    if (poll.kind === "failed_transient") expect(poll.reason).toMatch(/no result url/i);
  });

  it("poll: maps FAILED to failed_transient (no distinguishable not-retryable signal)", async () => {
    const poll = await provider(async () => taskAnswer({ taskId: "T1", status: "FAILED", errorCode: "5", errorMessage: "generation failed" })).poll("T1");

    expect(poll.kind).toBe("failed_transient");
  });

  it("submit: 4xx except 408/429 is not retryable", async () => {
    const mockFetch = async (): Promise<Response> => new Response("forbidden", { status: 403 });
    const provider = createRunningHubVideoProvider({
      fetchFn: mockFetch,
      loadKey: () => "test-api-key",
    });
    const result = await provider.submit({
      imageBytes: VALID_IMAGE,
      instruction: "animate",
      durationSeconds: 8,
    });
    expect(result.kind).toBe("failed_not_retryable");
  });

  it("submit: 408 is transient", async () => {
    const mockFetch = async (): Promise<Response> => new Response("timeout", { status: 408 });
    const provider = createRunningHubVideoProvider({
      fetchFn: mockFetch,
      loadKey: () => "test-api-key",
    });
    const result = await provider.submit({
      imageBytes: VALID_IMAGE,
      instruction: "animate",
      durationSeconds: 8,
    });
    expect(result.kind).toBe("failed_transient");
  });

  it("submit: an unexpected response shape is transient", async () => {
    const mockFetch = async (): Promise<Response> =>
      new Response(JSON.stringify({ unexpected: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    const provider = createRunningHubVideoProvider({
      fetchFn: mockFetch,
      loadKey: () => "test-api-key",
    });
    const result = await provider.submit({
      imageBytes: VALID_IMAGE,
      instruction: "animate",
      durationSeconds: 8,
    });
    expect(result.kind).toBe("failed_transient");
  });

  it("submit: missing credential is not retryable", async () => {
    const provider = createRunningHubVideoProvider({
      fetchFn: async () => new Response("ok", { status: 200 }),
      loadKey: () => {
        throw new Error("missing credential 'RUNNINGHUB_API_KEY'");
      },
    });
    const result = await provider.submit({
      imageBytes: VALID_IMAGE,
      instruction: "animate",
      durationSeconds: 8,
    });
    expect(result.kind).toBe("failed_not_retryable");
    if (result.kind === "failed_not_retryable") {
      expect(result.reason).toContain("RUNNINGHUB_API_KEY");
    }
  });
});

describe("downloadGeneratedClip", () => {
  beforeEach(() => resetVideoDownloadFetch());

  // A connection reset while the body streams (ECONNRESET) must be a failed download, never an unhandled rejection
  // that ends the backend process.
  it("fails when the connection resets while the body is being read", async () => {
    const body = new ReadableStream<Uint8Array>({ start: (controller) => controller.error(new Error("read ECONNRESET")) });
    setVideoDownloadFetch((async () => new Response(body, { status: 200 })));

    const result = await downloadGeneratedClip("https://example.com/clip.mp4");

    expect(result).toEqual({ ok: false, reason: "the generated clip could not be downloaded" });
  });
});
