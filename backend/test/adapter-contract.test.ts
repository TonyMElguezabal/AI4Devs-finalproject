import { describe, expect, it } from "vitest";
import { createElevenLabsAlignmentProvider } from "../src/alignmentProvider.ts";
import { createFalAiImageProvider } from "../src/imageProvider.ts";
import { PARAMETER_SHAPES, type AdapterTypeId } from "../src/providerTypes.ts";
import { createRunningHubVideoProvider } from "../src/videoProvider.ts";
import { createOpenAiVisualInstructionGenerator } from "../src/visualInstructions.ts";
import { createElevenLabsVoiceProvider } from "../src/voiceProvider.ts";

// shared-adapter-contract-suite (JOS-263), design Decisions 1-3 — one table of vendor answers that every operation of
// every shipped adapter type must classify the same way, against a fake vendor, with exactly one request per failure.
// The fixtures are keyed by AdapterTypeId, so a new adapter type does not compile until it has one.

interface ContractOperation {
  name: string;
  call: (fetchFn: typeof fetch) => Promise<{ kind: string; unresponsive?: true }>;
  /** The vendor's valid answer to a request; routes by URL when success takes more than one request. */
  validAnswer: (url: string) => Response;
  successKind: string;
  malformed: "transient" | "invalid-output";
  marksUnresponsive: boolean;
  requestsOnSuccess: number;
}

interface AdapterContractFixture {
  operations: ContractOperation[];
}

const KEY = () => "test-key";
const json = (body: unknown): Response => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

// The valid answers are the ones the per-adapter tests use, checked against the real APIs by the opt-in *.contract tests.
const QUEUE = "https://queue.fal.run/fal-ai/flux/requests/req-1";
const runningHubTask = (fields: Record<string, unknown>): Response =>
  json({ taskId: "", status: "", errorCode: "", errorMessage: "", results: null, clientId: "", ...fields });

const FIXTURES: Record<AdapterTypeId, AdapterContractFixture> = {
  "openai-reasoning": {
    operations: [
      {
        name: "generate",
        call: (fetchFn) => createOpenAiVisualInstructionGenerator({ fetchFn, loadKey: KEY }).generate(["A harbor at dusk."], "en"),
        validAnswer: () => json({ choices: [{ message: { content: JSON.stringify({ scenes: [{ image: "A quiet harbor", video: "A slow pan" }] }) } }] }),
        successKind: "success",
        malformed: "invalid-output",
        marksUnresponsive: false, // JOS-260
        requestsOnSuccess: 1,
      },
    ],
  },
  "elevenlabs-voice": {
    operations: [
      {
        name: "synthesize",
        call: (fetchFn) =>
          createElevenLabsVoiceProvider({ fetchFn, loadKey: KEY }).synthesize({
            text: "Hello.", language: "en", voiceId: "voice", model: "model", outputFormat: "mp3_44100_128", speed: "default",
          }),
        validAnswer: () => json({ audio_base64: Buffer.from("fake-mp3-bytes").toString("base64") }),
        successKind: "success",
        malformed: "transient",
        marksUnresponsive: true,
        requestsOnSuccess: 1,
      },
    ],
  },
  "elevenlabs-alignment": {
    operations: [
      {
        name: "align",
        call: (fetchFn) => createElevenLabsAlignmentProvider({ fetchFn, loadKey: KEY }).align(Buffer.from([0x49, 0x44, 0x33]), "Hi"),
        validAnswer: () => json({ characters: [{ text: "H", start: 0.1, end: 0.2 }, { text: "i", start: 0.2, end: 0.3 }], words: [], loss: 0.1 }),
        successKind: "success",
        malformed: "invalid-output",
        marksUnresponsive: false, // JOS-260
        requestsOnSuccess: 1,
      },
    ],
  },
  "fal-image": {
    operations: [
      {
        name: "submit",
        call: (fetchFn) => createFalAiImageProvider({ fetchFn, loadKey: KEY, parameters: { model: "fal-ai/flux/dev" } }).submit("A lighthouse at dusk"),
        validAnswer: () =>
          json({ status: "IN_QUEUE", request_id: "req-1", response_url: QUEUE, status_url: `${QUEUE}/status`, cancel_url: `${QUEUE}/cancel` }),
        successKind: "submitted",
        malformed: "transient",
        marksUnresponsive: true,
        requestsOnSuccess: 1,
      },
    ],
  },
  "runninghub-video": {
    operations: [
      {
        // A failure is answered on the upload, its first request, so no task is ever created after a failed upload.
        name: "submit",
        call: (fetchFn) =>
          createRunningHubVideoProvider({ fetchFn, loadKey: KEY }).submit({ imageBytes: Buffer.from("image"), instruction: "animate", durationSeconds: 8 }),
        validAnswer: (url) =>
          url.includes("/media/upload")
            ? json({ code: 0, msg: "success", errorMessages: null, data: { type: "image", download_url: "https://cdn.runninghub.io/img/a.png", fileName: "a.png", size: "1" } })
            : runningHubTask({ taskId: "task-1", status: "QUEUED" }),
        successKind: "submitted",
        malformed: "transient",
        marksUnresponsive: true,
        requestsOnSuccess: 2,
      },
      {
        name: "poll",
        call: (fetchFn) => createRunningHubVideoProvider({ fetchFn, loadKey: KEY }).poll("task-1"),
        validAnswer: () => runningHubTask({ taskId: "task-1", status: "SUCCESS", results: [{ url: "https://cdn.runninghub.io/output/clip.mp4", outputType: "mp4" }] }),
        successKind: "success",
        malformed: "transient",
        marksUnresponsive: true,
        requestsOnSuccess: 1,
      },
    ],
  },
};

/** The one reading of an adapter's result that every case asserts on. */
function classify(result: { kind: string; unresponsive?: true }): string {
  if (result.kind === "failed_not_retryable") return "not-retryable";
  if (result.kind === "failed_transient") return result.unresponsive ? "transient-unresponsive" : "transient";
  if (result.kind === "invalid_output") return "invalid-output";
  return result.kind;
}

type VendorAnswer = { name: string; answer: () => Response; expected: (operation: ContractOperation) => string };

const NOT_RETRYABLE = [400, 401, 402, 403, 404, 413, 422];
const TRANSIENT = [408, 429, 500, 502, 503, 504];
const neverAnswered = (operation: ContractOperation) => (operation.marksUnresponsive ? "transient-unresponsive" : "transient");

const FAILURES: VendorAnswer[] = [
  ...NOT_RETRYABLE.map((status) => ({ name: `HTTP ${status}`, answer: () => new Response("{}", { status }), expected: () => "not-retryable" })),
  ...TRANSIENT.map((status) => ({ name: `HTTP ${status}`, answer: () => new Response("{}", { status }), expected: () => "transient" })),
  {
    name: "a refused connection",
    answer: () => {
      throw new TypeError("fetch failed");
    },
    expected: neverAnswered,
  },
  {
    // What an aborted AbortSignal.timeout() makes fetch reject with; the adapters' real timers are tested in their own files.
    name: "a timeout",
    answer: () => {
      throw new DOMException("The operation timed out.", "TimeoutError");
    },
    expected: neverAnswered,
  },
  { name: "a malformed 200 body", answer: () => new Response("not json", { status: 200 }), expected: (operation) => operation.malformed },
];

function countingFetch(answer: (url: string) => Response) {
  const requests: string[] = [];
  const fetchFn = (async (url: string | URL | Request) => {
    requests.push(String(url));
    return answer(String(url));
  }) as typeof fetch;
  return { fetchFn, requests };
}

const OPERATIONS = Object.entries(FIXTURES).flatMap(([adapterType, fixture]) =>
  fixture.operations.map((operation) => ({ label: `${adapterType} ${operation.name}`, operation })),
);

describe("every shipped adapter type has contract fixtures", () => {
  it("lists exactly the adapter types in PARAMETER_SHAPES", () => {
    expect(Object.keys(FIXTURES).sort()).toEqual(Object.keys(PARAMETER_SHAPES).sort());
  });
});

describe.each(OPERATIONS)("$label", ({ operation }) => {
  it(`returns ${operation.successKind} for a valid answer`, async () => {
    const { fetchFn, requests } = countingFetch(operation.validAnswer);

    expect(classify(await operation.call(fetchFn))).toBe(operation.successKind);
    expect(requests).toHaveLength(operation.requestsOnSuccess);
  });

  it.each(FAILURES)("classifies $name after exactly one request", async (failure) => {
    const { fetchFn, requests } = countingFetch(failure.answer);

    expect(classify(await operation.call(fetchFn))).toBe(failure.expected(operation));
    expect(requests).toHaveLength(1);
  });
});
