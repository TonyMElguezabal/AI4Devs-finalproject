import { describe, expect, it } from "vitest";
import { DECOMPOSITION_PROVIDER } from "../src/config/providers.ts";
import { createOpenAiVisualInstructionGenerator } from "../src/visualInstructions.ts";

// assign-scene-identifiers (JOS-144), group 3 — design Decision 4: one
// reasoning request returns the IMAGE and VIDEO instructions for every
// fragment, validated with Zod; failures are classified by HTTP status (the
// product owner's rule, as for voice); exactly one request, no retry.

const FRAGMENTS = ["A harbor at dusk.", "Boats return with the tide."];

type RecordedCall = { url: string; init: RequestInit };

function fakeFetch(response: () => Response | Promise<Response>): { fetchFn: typeof fetch; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return response();
  }) as typeof fetch;
  return { fetchFn, calls };
}

function completion(content: unknown): Response {
  return new Response(
    JSON.stringify({ choices: [{ message: { content: typeof content === "string" ? content : JSON.stringify(content) } }] }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

const TWO_PAIRS = {
  scenes: [
    { image: "Wide shot of a quiet harbor at dusk", video: "Slow pan across the water" },
    { image: "Fishing boats entering the harbor", video: "Boats glide in on the tide" },
  ],
};

function generatorWith(fetchFn: typeof fetch, loadKey: () => string = () => "test-key") {
  return createOpenAiVisualInstructionGenerator({ fetchFn, loadKey, timeoutMs: 50 });
}

describe("The request (Decision 4)", () => {
  it("sends one chat-completions request with the recorded model, JSON output, every fragment in order, and the credential", async () => {
    const { fetchFn, calls } = fakeFetch(() => completion(TWO_PAIRS));

    await generatorWith(fetchFn).generate(FRAGMENTS, "en");

    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call?.url).toBe("https://api.openai.com/v1/chat/completions");
    expect(call?.init.method).toBe("POST");
    expect((call?.init.headers as Record<string, string>).Authorization).toBe("Bearer test-key");
    const body = JSON.parse(String(call?.init.body));
    expect(body.model).toBe(DECOMPOSITION_PROVIDER.model);
    expect(body.response_format).toEqual({ type: "json_object" });
    const userMessage = JSON.parse(body.messages.find((m: { role: string }) => m.role === "user").content);
    expect(userMessage).toEqual({
      language: "en",
      scenes: [
        { index: 1, text: "A harbor at dusk." },
        { index: 2, text: "Boats return with the tide." },
      ],
    });
  });

  it("returns one instruction pair per fragment, in order", async () => {
    const { fetchFn } = fakeFetch(() => completion(TWO_PAIRS));
    expect(await generatorWith(fetchFn).generate(FRAGMENTS, "en")).toEqual({ kind: "success", pairs: TWO_PAIRS.scenes });
  });

  it("trims the instructions", async () => {
    const { fetchFn } = fakeFetch(() =>
      completion({ scenes: [{ image: "  an image  ", video: "\ta video\n" }, { image: "b", video: "c" }] }),
    );
    const result = await generatorWith(fetchFn).generate(FRAGMENTS, "en");
    expect(result).toEqual({ kind: "success", pairs: [{ image: "an image", video: "a video" }, { image: "b", video: "c" }] });
  });
});

describe("The response is validated (Decision 4, AC3)", () => {
  it.each([
    ["one pair too few", { scenes: [TWO_PAIRS.scenes[0]] }],
    ["one pair too many", { scenes: [...TWO_PAIRS.scenes, TWO_PAIRS.scenes[0]] }],
    ["an empty image", { scenes: [{ image: "  ", video: "v" }, TWO_PAIRS.scenes[1]] }],
    ["a missing video", { scenes: [{ image: "i" }, TWO_PAIRS.scenes[1]] }],
    ["no scenes key", { items: TWO_PAIRS.scenes }],
    ["content that is not JSON", "not json at all"],
  ])("reports %s as invalid output", async (_label, content) => {
    const { fetchFn } = fakeFetch(() => completion(content));
    const result = await generatorWith(fetchFn).generate(FRAGMENTS, "en");
    expect(result.kind).toBe("invalid_output");
  });

  it("reports a response without choices as invalid output", async () => {
    const { fetchFn } = fakeFetch(() => new Response(JSON.stringify({}), { status: 200 }));
    expect((await generatorWith(fetchFn).generate(FRAGMENTS, "en")).kind).toBe("invalid_output");
  });
});

describe("Failures are classified by HTTP status (product owner rule)", () => {
  it.each([400, 401, 403, 404, 422])("classifies HTTP %i as not retryable", async (status) => {
    const { fetchFn } = fakeFetch(() => new Response("{}", { status }));
    expect((await generatorWith(fetchFn).generate(FRAGMENTS, "en")).kind).toBe("failed_not_retryable");
  });

  it.each([408, 429, 500, 502, 503])("classifies HTTP %i as transient", async (status) => {
    const { fetchFn } = fakeFetch(() => new Response("{}", { status }));
    expect((await generatorWith(fetchFn).generate(FRAGMENTS, "en")).kind).toBe("failed_transient");
  });

  it("classifies a network error as transient", async () => {
    const fetchFn = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    expect((await generatorWith(fetchFn).generate(FRAGMENTS, "en")).kind).toBe("failed_transient");
  });

  it("classifies exceeding the phase limit as transient", async () => {
    const fetchFn = ((_url: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      })) as typeof fetch;
    const result = await generatorWith(fetchFn).generate(FRAGMENTS, "en");
    expect(result).toMatchObject({ kind: "failed_transient" });
    expect(result.kind === "failed_transient" && result.reason).toMatch(/time limit/);
  });

  it("fails without sending anything when the credential is missing, naming it but not revealing anything", async () => {
    const { fetchFn, calls } = fakeFetch(() => completion(TWO_PAIRS));
    const result = await generatorWith(fetchFn, () => {
      throw new Error("missing credential 'OPENAI_KEY'");
    }).generate(FRAGMENTS, "en");

    expect(calls).toHaveLength(0);
    expect(result).toMatchObject({ kind: "failed_not_retryable" });
    expect(result.kind === "failed_not_retryable" && result.reason).toMatch(/OPENAI_KEY/);
  });

  it("never puts the provider's raw error body or the credential in the reason", async () => {
    const { fetchFn } = fakeFetch(() => new Response('{"error":{"message":"secret internal detail sk-live-123"}}', { status: 400 }));
    const result = await generatorWith(fetchFn, () => "sk-test-SECRET").generate(FRAGMENTS, "en");
    const reason = "reason" in result ? result.reason : "";
    expect(reason).not.toMatch(/secret internal detail|sk-live-123|sk-test-SECRET/);
    expect(reason).toMatch(/400/);
  });

  it("makes exactly one request even when it fails", async () => {
    const { fetchFn, calls } = fakeFetch(() => new Response("{}", { status: 503 }));
    await generatorWith(fetchFn).generate(FRAGMENTS, "en");
    expect(calls).toHaveLength(1);
  });
});
