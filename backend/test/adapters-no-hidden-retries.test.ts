import { describe, expect, it } from "vitest";
import { createElevenLabsAlignmentProvider } from "../src/alignmentProvider.ts";
import { createFalAiImageProvider } from "../src/imageProvider.ts";
import { createRunningHubVideoProvider } from "../src/videoProvider.ts";
import { createOpenAiVisualInstructionGenerator } from "../src/visualInstructions.ts";
import { createElevenLabsVoiceProvider } from "../src/voiceProvider.ts";

// bounded-retry-policy (JOS-184), group 5 — Decision 6: the retry policy's
// budget is the only retry mechanism. An adapter makes exactly one provider
// request per call, so a failing call is made once, whatever the failure:
// a transient status, a rate limit, a not-retryable status or a network error.
// A hidden retry inside an adapter would multiply the budget of four attempts.

type Failure = { name: string; respond: () => Response | Promise<Response> };

const FAILURES: Failure[] = [
  { name: "HTTP 503", respond: () => new Response("{}", { status: 503 }) },
  { name: "HTTP 429 with a Retry-After header", respond: () => new Response("{}", { status: 429, headers: { "Retry-After": "1" } }) },
  { name: "HTTP 408", respond: () => new Response("{}", { status: 408 }) },
  { name: "HTTP 400", respond: () => new Response("{}", { status: 400 }) },
  {
    name: "a network error",
    respond: () => {
      throw new TypeError("fetch failed");
    },
  },
];

function countingFetch(failure: Failure) {
  const calls: string[] = [];
  const fetchFn = (async (url: string | URL | Request) => {
    calls.push(String(url));
    return failure.respond();
  }) as typeof fetch;
  return { fetchFn, calls };
}

const KEY = () => "test-key";

describe.each(FAILURES)("A failing provider call ($name)", (failure) => {
  it("voice: one request", async () => {
    const { fetchFn, calls } = countingFetch(failure);

    await createElevenLabsVoiceProvider({ fetchFn, loadKey: KEY }).synthesize({
      text: "Hello.", language: "en", voiceId: "voice", model: "model", outputFormat: "mp3_44100_128", speed: "default",
    });

    expect(calls).toHaveLength(1);
  });

  it("alignment: one request", async () => {
    const { fetchFn, calls } = countingFetch(failure);

    await createElevenLabsAlignmentProvider({ fetchFn, loadKey: KEY }).align(Buffer.from([0x49, 0x44, 0x33]), "Hello.");

    expect(calls).toHaveLength(1);
  });

  it("image: one request", async () => {
    const { fetchFn, calls } = countingFetch(failure);

    await createFalAiImageProvider({ fetchFn, loadKey: KEY }).generate("A lighthouse at dusk");

    expect(calls).toHaveLength(1);
  });

  it("reasoning: one request", async () => {
    const { fetchFn, calls } = countingFetch(failure);

    await createOpenAiVisualInstructionGenerator({ fetchFn, loadKey: KEY }).generate(["The sun rose."], "en");

    expect(calls).toHaveLength(1);
  });

  it("video submit: one upload, and no task is created after a failed upload", async () => {
    const { fetchFn, calls } = countingFetch(failure);

    await createRunningHubVideoProvider({ fetchFn, loadKey: KEY }).submit({ imageBytes: Buffer.from("image"), instruction: "animate", durationSeconds: 8 });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("/media/upload");
  });

  it("video poll: one status request", async () => {
    const { fetchFn, calls } = countingFetch(failure);

    await createRunningHubVideoProvider({ fetchFn, loadKey: KEY }).poll("task-1");

    expect(calls).toHaveLength(1);
  });
});
