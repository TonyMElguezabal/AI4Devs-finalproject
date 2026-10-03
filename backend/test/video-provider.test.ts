import { randomUUID } from "node:crypto";
import { describe, expect, it, beforeEach } from "vitest";
import {
  createStubVideoProvider,
  createRunningHubVideoProvider,
  resetVideoDownloadFetch,
  setVideoDownloadFetch,
  type VideoGenerationResult,
  type VideoSubmitResult,
} from "../src/videoProvider.ts";

// generate-chunk-video (JOS-146), group 3 — Decision 3: the VideoProvider port
// with an async submit/poll shape; stub covers all test modes; RunningHub
// adapter is tested against a mocked HTTP layer.

const TEST_BYTES = Buffer.from("fake-mp4-bytes");
const VALID_IMAGE = Buffer.from("fake-image-bytes");

describe("StubVideoProvider (Decision 3 — covers all outcome modes)", () => {
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

  it("poll with an unknown requestId returns not_found", async () => {
    const provider = createStubVideoProvider("success-bytes");
    const poll = await provider.poll(randomUUID());
    expect(poll.kind).toBe("not_found");
  });

  it("records calls in the calls list", async () => {
    const provider = createStubVideoProvider("success-bytes");
    await provider.submit({ imageBytes: VALID_IMAGE, instruction: "my instruction", durationSeconds: 10 });
    expect(provider.calls).toEqual(["my instruction"]);
  });
});

describe("RunningHub adapter (Decision 3 — tested against mocked HTTP)", () => {
  beforeEach(() => {
    resetVideoDownloadFetch();
  });

  function makeUploadResponse(url: string): Response {
    return new Response(
      JSON.stringify({ code: 0, data: { fileUrl: url } }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  function makeSubmitResponse(taskId: string): Response {
    return new Response(
      JSON.stringify({ code: 0, data: { taskId } }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  function makeQueryPendingResponse(): Response {
    return new Response(
      JSON.stringify({ code: 0, data: { taskStatus: "QUEUED" } }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  function makeQuerySuccessResponse(resultUrl: string): Response {
    return new Response(
      JSON.stringify({
        code: 0,
        data: {
          taskStatus: "SUCCESS",
          outputList: [{ fileUrl: resultUrl }],
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  function makeQueryFailedResponse(): Response {
    return new Response(
      JSON.stringify({ code: 0, data: { taskStatus: "FAILED" } }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  it("submit: uploads the image bytes and sends prompt, duration, resolution and firstFrameUrl", async () => {
    const calls: { url: string; options?: RequestInit }[] = [];
    const taskId = randomUUID();
    const uploadUrl = "https://cdn.runninghub.io/img/abc.jpg";

    const mockFetch = async (url: string, options?: RequestInit): Promise<Response> => {
      calls.push({ url, options });
      if (url.includes("/media/upload")) return makeUploadResponse(uploadUrl);
      if (url.includes("/task/openapi/create")) return makeSubmitResponse(taskId);
      return new Response("unexpected", { status: 404 });
    };

    const provider = createRunningHubVideoProvider({
      fetchFn: mockFetch as typeof fetch,
      loadKey: () => "test-api-key",
    });

    const result = await provider.submit({
      imageBytes: VALID_IMAGE,
      instruction: "animate the scene",
      durationSeconds: 8,
    });

    expect(result.kind).toBe("submitted");
    if (result.kind === "submitted") expect(result.requestId).toBe(taskId);

    const submitCall = calls.find((c) => c.url.includes("/task/openapi/create"));
    expect(submitCall).toBeTruthy();
    const body = JSON.parse(submitCall!.options?.body as string);
    expect(body.prompt).toBe("animate the scene");
    expect(body.duration).toBe(8);
    expect(body.resolution).toBe("2K");
    expect(body.firstFrameUrl).toBe(uploadUrl);
  });

  it("poll: maps QUEUED/RUNNING to pending", async () => {
    const taskId = randomUUID();
    const mockFetch = async (): Promise<Response> => makeQueryPendingResponse();
    const provider = createRunningHubVideoProvider({
      fetchFn: mockFetch as typeof fetch,
      loadKey: () => "test-api-key",
    });
    const poll = await provider.poll(taskId);
    expect(poll.kind).toBe("pending");
  });

  it("poll: maps SUCCESS with results[0].url to a temporary-url success", async () => {
    const taskId = randomUUID();
    const resultUrl = "https://cdn.runninghub.io/output/clip.mp4";
    const mockFetch = async (): Promise<Response> => makeQuerySuccessResponse(resultUrl);
    const provider = createRunningHubVideoProvider({
      fetchFn: mockFetch as typeof fetch,
      loadKey: () => "test-api-key",
    });
    const poll = await provider.poll(taskId);
    expect(poll.kind).toBe("success");
    if (poll.kind === "success") {
      expect(poll.clip.source).toBe("temporary-url");
      if (poll.clip.source === "temporary-url") expect(poll.clip.url).toBe(resultUrl);
    }
  });

  it("poll: maps FAILED to failed_transient (no distinguishable not-retryable signal)", async () => {
    const taskId = randomUUID();
    const mockFetch = async (): Promise<Response> => makeQueryFailedResponse();
    const provider = createRunningHubVideoProvider({
      fetchFn: mockFetch as typeof fetch,
      loadKey: () => "test-api-key",
    });
    const poll = await provider.poll(taskId);
    expect(poll.kind).toBe("failed_transient");
  });

  it("submit: 4xx except 408/429 is not retryable", async () => {
    const mockFetch = async (): Promise<Response> => new Response("forbidden", { status: 403 });
    const provider = createRunningHubVideoProvider({
      fetchFn: mockFetch as typeof fetch,
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
      fetchFn: mockFetch as typeof fetch,
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
      fetchFn: mockFetch as typeof fetch,
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
