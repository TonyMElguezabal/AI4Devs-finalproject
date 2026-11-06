import { describe, expect, it } from "vitest";
import { validateProviderParameters } from "../src/providerTypes.ts";
import { createConfiguredVideoProvider } from "../src/videoConnector.ts";
import { definitionRequests, json, miniMaxParameters, recordingFetch, runningHubParameters, runwayParameters, withStep } from "./videoConnectorFixtures.ts";

// configurable-video-connector (JOS-219), tasks 2.1-2.3 and 2.9 — a video provider described by a definition on /admin:
// what a definition may say, how its templates are filled, and how the connector runs the submit-and-poll port.

const KEY = "key-test-0123456789abcdef";
const IMAGE = Buffer.from("fake-png-bytes");
const SUBMIT = { imageBytes: IMAGE, instruction: "animate the harbor", durationSeconds: 6 };
const runwayTask = (fields: Record<string, unknown>) => json({ id: "task-1", createdAt: "2026-11-06T06:35:44.416Z", ...fields });

function problemFields(parameters: Record<string, unknown>): string[] {
  const result = validateProviderParameters("configured-video", parameters);
  return result.ok ? [] : result.problems.map((problem) => problem.field);
}

function provider(parameters: Record<string, unknown>, answer: (url: string, init: RequestInit) => Response) {
  const recorded = recordingFetch(answer);
  return { connector: createConfiguredVideoProvider({ fetchFn: recorded.fetchFn, loadKey: () => KEY, parameters }), requests: recorded.requests };
}

const sentJson = (init: RequestInit): Record<string, unknown> => JSON.parse(String(init.body)) as Record<string, unknown>;
const headersOf = (init: RequestInit): Record<string, string> => init.headers as Record<string, string>;

describe("a connector definition (task 2.1)", () => {
  it("accepts the three definitions of the docs page", () => {
    expect(problemFields(runwayParameters())).toEqual([]);
    expect(problemFields(runningHubParameters())).toEqual([]);
    expect(problemFields(miniMaxParameters())).toEqual([]);
  });

  it.each([
    ["an http base URL", "http://api.dev.runwayml.com"],
    ["a base URL with a path", "https://api.dev.runwayml.com/v1"],
    ["a base URL with a query", "https://api.dev.runwayml.com?x=1"],
    ["a base URL with credentials", "https://user:pass@api.dev.runwayml.com"],
    ["something that is not a URL", "api.dev.runwayml.com"],
  ])("refuses %s on baseUrl", (_name, baseUrl) => {
    expect(problemFields(runwayParameters({ baseUrl }))).toEqual(["baseUrl"]);
  });

  it("accepts a base URL with a port", () => {
    expect(problemFields(runwayParameters({ baseUrl: "https://api.example.com:8443" }))).toEqual([]);
  });

  it("refuses a step path that is a URL", () => {
    const requests = withStep(definitionRequests("runway"), "submit", { path: "https://evil.example/v1/image_to_video" });
    expect(problemFields(runwayParameters({ requests }))).toEqual(["requests.submit.path"]);
  });

  it("lists every problem at once, each with its path inside requests", () => {
    const base = definitionRequests("runway");
    const poll = { ...(base.poll as Record<string, unknown>) };
    delete poll.statusAt;
    const requests = { ...withStep(base, "submit", { body: { promptImage: "{image_url}" } }), poll };
    expect(problemFields(runwayParameters({ requests }))).toEqual(["requests.poll.statusAt", "requests.submit.body"]);
  });

  it.each([
    ["an unknown placeholder", "submit", { body: { promptText: "{prompt}" } }, "requests.submit.body"],
    ["{image_url} without an upload step", "submit", { body: { promptImage: "{image_url}" } }, "requests.submit.body"],
    ["{task_id} outside the poll step", "submit", { path: "/v1/tasks/{task_id}" }, "requests.submit.path"],
    ["{key} in a body", "submit", { body: { apiKey: "{key}" } }, "requests.submit.body"],
    ["{key} in a path", "poll", { path: "/v1/tasks/{task_id}?key={key}" }, "requests.poll.path"],
  ])("refuses %s", (_name, step, fields, field) => {
    const requests = withStep(definitionRequests("runway"), step, fields);
    expect(problemFields(runwayParameters({ requests }))).toEqual([field]);
  });

  it("refuses {key} in the check step's path", () => {
    const requests = withStep(definitionRequests("runway"), "check", { path: "/v1/organization?key={key}" });
    expect(problemFields(runwayParameters({ requests }))).toEqual(["requests.check.path"]);
  });

  it("accepts a definition without the optional upload and check steps", () => {
    expect(problemFields(runwayParameters({ requests: withStep(definitionRequests("runway"), "check", null) }))).toEqual([]);
  });

  it("refuses a definition without a submit or a poll step", () => {
    expect(problemFields(runwayParameters({ requests: withStep(definitionRequests("runway"), "poll", null) }))).toEqual(["requests.poll"]);
  });
});

describe("the resolution of a connector profile (task 2.9)", () => {
  it.each(["2K", "2k", "auto_1440p", "4K", "2160p", "2560:1440", "3840:2160"])("refuses %s as above 1080p", (resolution) => {
    const result = validateProviderParameters("configured-video", runwayParameters({ resolution }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problems).toEqual([{ field: "resolution", message: expect.stringMatching(/1080p/) }]);
    }
  });

  it.each(["auto_720p", "auto_1080p", "768P", "720p", "1080p"])("accepts %s", (resolution) => {
    expect(problemFields(runwayParameters({ resolution }))).toEqual([]);
  });
});

describe("the templates (task 2.2)", () => {
  it("sends the Runway submit with typed values, the image as a data URI, the headers, and no other field", async () => {
    const { connector, requests } = provider(runwayParameters(), () => json({ id: "task-1" }));

    await connector.submit(SUBMIT);

    expect(requests).toHaveLength(1);
    expect(requests[0]!.url).toBe("https://api.dev.runwayml.com/v1/image_to_video");
    expect(requests[0]!.init.method).toBe("POST");
    expect(headersOf(requests[0]!.init)).toMatchObject({ Authorization: `Bearer ${KEY}`, "X-Runway-Version": "2024-11-06" });
    expect(sentJson(requests[0]!.init)).toEqual({
      model: "wan3",
      promptText: "animate the harbor",
      promptImage: `data:image/png;base64,${IMAGE.toString("base64")}`,
      duration: 6,
      ratio: "auto_720p",
    });
  });

  it("replaces a placeholder inside a longer string as text, and {image_base64} with the bare image", async () => {
    const requests = withStep(definitionRequests("runway"), "submit", { body: { text: "Scene: {instruction} ({duration} s)", image: "{image_base64}" } });
    const { connector, requests: sent } = provider(runwayParameters({ requests }), () => json({ id: "task-1" }));

    await connector.submit(SUBMIT);

    expect(sentJson(sent[0]!.init)).toEqual({ text: "Scene: animate the harbor (6 s)", image: IMAGE.toString("base64") });
  });

  // Found in step 8: Runway refuses a JPEG labelled PNG ("Failed to fetch image metadata"), and the image provider sends JPEGs.
  it.each([
    ["a JPEG", Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2]), "image/jpeg", "frame.jpg"],
    ["a PNG", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "image/png", "frame.png"],
    ["anything else", IMAGE, "image/png", "frame.png"],
  ])("names the real type of %s in the data URI and the upload", async (_name, imageBytes, type, fileName) => {
    const runway = provider(runwayParameters(), () => json({ id: "task-1" }));
    await runway.connector.submit({ ...SUBMIT, imageBytes });
    expect(sentJson(runway.requests[0]!.init).promptImage).toBe(`data:${type};base64,${imageBytes.toString("base64")}`);

    const runningHub = provider(runningHubParameters(), (url) =>
      url.endsWith("/media/upload/binary") ? json({ data: { download_url: "https://cdn.runninghub.io/a" } }) : json({ taskId: "T1", errorCode: "" }),
    );
    await runningHub.connector.submit({ ...SUBMIT, imageBytes });
    const file = (runningHub.requests[0]!.init.body as FormData).get("file") as File;
    expect([file.type, file.name]).toEqual([type, fileName]);
  });

  it("URL-encodes a placeholder in a path", async () => {
    const { connector, requests } = provider(runwayParameters(), () => runwayTask({ status: "RUNNING" }));

    await connector.poll("a b/c");

    expect(requests[0]!.url).toBe("https://api.dev.runwayml.com/v1/tasks/a%20b%2Fc");
    expect(requests[0]!.init.method).toBe("GET");
    expect(requests[0]!.init.body).toBeUndefined();
  });
});

describe("the connector (task 2.3)", () => {
  describe("submit", () => {
    it("returns the task id and a recorded body without the image or the key", async () => {
      const { connector } = provider(runwayParameters(), () => json({ id: "task-1", estimatedCost: { credits: 50 } }));

      const result = await connector.submit(SUBMIT);

      expect(result).toEqual({ kind: "submitted", requestId: "task-1", sentBody: { prompt: "animate the harbor", duration: 6, resolution: "auto_720p" } });
      expect(JSON.stringify(result)).not.toContain(KEY);
      expect(JSON.stringify(result)).not.toContain(IMAGE.toString("base64"));
    });

    it("uploads the image as a multipart file first when the definition has an upload step", async () => {
      const { connector, requests } = provider(runningHubParameters(), (url) =>
        url.endsWith("/media/upload/binary")
          ? json({ code: 0, msg: "success", data: { download_url: "https://cdn.runninghub.io/img/a.png" } })
          : json({ taskId: "T1", status: "QUEUED", errorCode: "" }),
      );

      const result = await connector.submit(SUBMIT);

      expect(requests.map((request) => request.url)).toEqual([
        "https://www.runninghub.ai/openapi/v2/media/upload/binary",
        "https://www.runninghub.ai/openapi/v2/minimax/hailuo-h3/image-to-video",
      ]);
      const form = requests[0]!.init.body as FormData;
      expect(form).toBeInstanceOf(FormData);
      expect(Buffer.from(await (form.get("file") as Blob).arrayBuffer())).toEqual(IMAGE);
      expect(headersOf(requests[0]!.init)).toEqual({ Authorization: `Bearer ${KEY}` });
      expect(sentJson(requests[1]!.init)).toEqual({ prompt: "animate the harbor", duration: 6, resolution: "768P", firstFrameUrl: "https://cdn.runninghub.io/img/a.png" });
      expect(result).toMatchObject({ kind: "submitted", requestId: "T1" });
    });

    it("fails as transient, naming the step and the vendor code, when a 200 answer carries an error", async () => {
      const { connector, requests } = provider(runningHubParameters(), () => json({ code: 0, errorCode: "1000", errorMessage: `bad file for ${KEY}` }));

      const result = await connector.submit(SUBMIT);

      expect(result.kind).toBe("failed_transient");
      expect(requests).toHaveLength(1);
      if (result.kind === "failed_transient") {
        expect(result.reason).toMatch(/upload/);
        expect(result.reason).toContain("1000");
        expect(result.reason).not.toContain(KEY);
      }
    });

    it("never copies the body of a refused answer into the reason (Runway's 401 repeats the end of the key)", async () => {
      const { connector } = provider(runwayParameters(), () =>
        json({ error: `The last 3 characters of the key we received are "${KEY.slice(-3)}".` }, 401),
      );

      const result = await connector.submit(SUBMIT);

      expect(result.kind).toBe("failed_not_retryable");
      if (result.kind === "failed_not_retryable") {
        expect(result.reason).toMatch(/submit/);
        expect(result.reason).toContain("401");
        expect(result.reason).not.toContain("last 3 characters");
      }
    });

    it("fails as transient, naming the step and the path, when the answer has no task id", async () => {
      const { connector } = provider(runwayParameters(), () => json({ estimatedCost: { credits: 50 } }));

      const result = await connector.submit(SUBMIT);

      expect(result).toEqual({ kind: "failed_transient", reason: expect.stringMatching(/submit.*\bid\b/) });
    });

    it("fails as not retryable, with no request, when the profile has no key", async () => {
      const recorded = recordingFetch(() => json({ id: "task-1" }));
      const connector = createConfiguredVideoProvider({
        fetchFn: recorded.fetchFn,
        loadKey: () => {
          throw new Error("missing API key for the video role (VIDEO_APIKEY)");
        },
        parameters: runwayParameters(),
      });

      expect((await connector.submit(SUBMIT)).kind).toBe("failed_not_retryable");
      expect(recorded.requests).toHaveLength(0);
    });
  });

  describe("poll", () => {
    it("is a success with the video link when the status is done", async () => {
      const { connector } = provider(runwayParameters(), () => runwayTask({ status: "SUCCEEDED", output: ["https://cdn.example/clip.mp4"], cost: { credits: 50 } }));

      expect(await connector.poll("task-1")).toEqual({ kind: "success", clip: { source: "temporary-url", url: "https://cdn.example/clip.mp4" } });
    });

    it("is a transient failure when the status is done but there is no link", async () => {
      const { connector } = provider(runwayParameters(), () => runwayTask({ status: "SUCCEEDED", output: [] }));

      expect(await connector.poll("task-1")).toEqual({ kind: "failed_transient", reason: expect.stringMatching(/output\[0\]/) });
    });

    it.each(["FAILED", "CANCELLED"])("is a transient failure carrying the vendor code when the status is %s", async (status) => {
      const { connector } = provider(runwayParameters(), () => runwayTask({ status, failureCode: "SAFETY.INPUT.TEXT" }));

      const result = await connector.poll("task-1");

      expect(result.kind).toBe("failed_transient");
      if (result.kind === "failed_transient") expect(result.reason).toContain("SAFETY.INPUT.TEXT");
    });

    it.each(["PENDING", "RUNNING", "THROTTLED"])("is pending when the status is %s", async (status) => {
      const { connector } = provider(runwayParameters(), () => runwayTask({ status }));

      expect(await connector.poll("task-1")).toEqual({ kind: "pending" });
    });

    it("is not found when the vendor answers the definition's not-found status", async () => {
      const { connector } = provider(runwayParameters(), () => json({ error: "Could not find Task" }, 404));

      expect(await connector.poll("task-1")).toEqual({ kind: "not_found" });
    });

    it("sends the poll body of the definition (RunningHub polls with a POST)", async () => {
      const { connector, requests } = provider(runningHubParameters(), () =>
        json({ taskId: "T1", status: "SUCCESS", errorCode: "", results: [{ url: "https://cdn.runninghub.io/output/clip.mp4" }] }),
      );

      expect(await connector.poll("T1")).toEqual({ kind: "success", clip: { source: "temporary-url", url: "https://cdn.runninghub.io/output/clip.mp4" } });
      expect(requests[0]!.url).toBe("https://www.runninghub.ai/openapi/v2/query");
      expect(requests[0]!.init.method).toBe("POST");
      expect(sentJson(requests[0]!.init)).toEqual({ taskId: "T1" });
    });

    it("is a transient failure carrying the vendor code when a 200 poll answer carries an error", async () => {
      const { connector } = provider(runningHubParameters(), () => json({ taskId: "T1", status: "", errorCode: "805", errorMessage: "task lost" }));

      const result = await connector.poll("T1");

      expect(result.kind).toBe("failed_transient");
      if (result.kind === "failed_transient") expect(result.reason).toContain("805");
    });

    it("follows a clip submitted before a restart by its stored id, with no new submit", async () => {
      // A new instance stands for the adapter the registry builds after the application starts again.
      const { connector, requests } = provider(runwayParameters(), () => runwayTask({ status: "RUNNING" }));

      expect(await connector.poll("63ef7987-6a42-4170-9e76-34172d13207f")).toEqual({ kind: "pending" });
      expect(requests.map((request) => `${request.init.method} ${request.url}`)).toEqual(["GET https://api.dev.runwayml.com/v1/tasks/63ef7987-6a42-4170-9e76-34172d13207f"]);
    });
  });
});

// Proven live on 2026-11-06 (a five-scene session, 57 clip seconds, USD 4.56 at 0.08 per second): MiniMax H3 called directly.
describe("the MiniMax H3 definition", () => {
  const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2]);

  it("submits the scene text and its image as the first frame, then returns the task id", async () => {
    const { connector, requests } = provider(miniMaxParameters(), () => json({ task_id: "424010985738629" }));

    const result = await connector.submit({ ...SUBMIT, imageBytes: JPEG });

    expect(result).toMatchObject({ kind: "submitted", requestId: "424010985738629" });
    expect(requests[0]!.url).toBe("https://api.minimax.io/v2/video_generation");
    expect(headersOf(requests[0]!.init)).toMatchObject({ Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" });
    expect(sentJson(requests[0]!.init)).toEqual({
      model: "MiniMax-H3",
      content: [
        { type: "text", text: "animate the harbor" },
        { type: "image_url", image_url: { url: `data:image/jpeg;base64,${JPEG.toString("base64")}` }, role: "first_frame" },
      ],
      resolution: "768P",
      duration: 6,
    });
  });

  it("polls the task by id in the path and reads the clip URL from task.content.url", async () => {
    const { connector, requests } = provider(miniMaxParameters(), () => json({ task: { status: "succeeded", content: { url: "https://video-product.cdn.minimax.io/a/output.mp4" } } }));

    expect(await connector.poll("424010985738629")).toEqual({ kind: "success", clip: { source: "temporary-url", url: "https://video-product.cdn.minimax.io/a/output.mp4" } });
    expect(requests[0]!.url).toBe("https://api.minimax.io/v2/query/video_generation/424010985738629");
    expect(requests[0]!.init.method).toBe("GET");
  });

  it.each([
    ["queued", { kind: "pending" }],
    ["running", { kind: "pending" }],
    ["failed", { kind: "failed_transient", reason: "the video task ended in failed" }],
    ["cancelled", { kind: "failed_transient", reason: "the video task ended in cancelled" }],
  ])("reads the status %s", async (status, expected) => {
    const { connector } = provider(miniMaxParameters(), () => json({ task: { status } }));
    expect(await connector.poll("1")).toEqual(expected);
  });

  it("refuses MiniMax's 2K, naming the 1080p limit", () => {
    expect(problemFields(miniMaxParameters({ resolution: "2K" }))).toEqual(["resolution"]);
  });
});
