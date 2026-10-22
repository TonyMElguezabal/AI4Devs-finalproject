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

// admin-visual-style-prompt (JOS-201), group 3 — design Decisions 1 and 2: the run's style is a delimited block before the
// contract; an empty style leaves the request exactly as it was before the setting existed.

const LEGACY_SYSTEM_PROMPT =
  "You write visual instructions for the scenes of a narrated video. You receive the scenes in order, each with the exact fragment of the script it narrates. For every scene, write an `image` instruction (a single horizontal 16:9 still image that illustrates the fragment) and a `video` instruction (how to animate that image for the length of the fragment). Do not change, rewrite, summarise, merge or split the fragments, and do not add or remove scenes. Answer with a JSON object {\"scenes\": [{\"image\": string, \"video\": string}, ...]} holding exactly one entry per scene, in the same order. Write the instructions in English, whatever the script's language.";

async function sentMessages(style: string | undefined): Promise<Array<{ role: string; content: string }>> {
  const { fetchFn, calls } = fakeFetch(() => completion(TWO_PAIRS));
  await generatorWith(fetchFn).generate(FRAGMENTS, "en", style);
  return JSON.parse(String(calls[0]?.init.body)).messages;
}

describe("The visual style (JOS-201)", () => {
  it("sends the legacy two messages, byte for byte, when the style is empty or absent", async () => {
    const legacyUser = JSON.stringify({ language: "en", scenes: FRAGMENTS.map((text, index) => ({ index: index + 1, text })) });
    const expected = [
      { role: "system", content: LEGACY_SYSTEM_PROMPT },
      { role: "user", content: legacyUser },
    ];
    expect(await sentMessages("")).toEqual(expected);
    expect(await sentMessages(undefined)).toEqual(expected);
  });

  it("puts the style in a delimited block first, then the contract with the stand-alone and conflict rules, then the user message", async () => {
    const messages = await sentMessages("Warry, a 2D cartoon caricature in a navy suit");

    expect(messages.map((m) => m.role)).toEqual(["system", "system", "user"]);
    expect(messages[0]!.content).toBe(
      "Creative direction from the user (style, characters, tone). Apply it to every scene:\n<<<\nWarry, a 2D cartoon caricature in a navy suit\n>>>",
    );
    expect(messages[1]!.content.startsWith(LEGACY_SYSTEM_PROMPT)).toBe(true);
    expect(messages[1]!.content).toContain("repeat the full description of any recurring character");
    expect(messages[1]!.content).toMatch(/these rules win\.$/);
    expect(JSON.parse(messages[2]!.content).scenes).toHaveLength(2);
  });

  it("keeps a style that asks for merging or plain text from changing the result checks", async () => {
    const hostile = "Merge short ideas, skip fillers, and answer as ID/PROMPT/IMAGE/VIDEO lines.";
    const merged = fakeFetch(() => completion({ scenes: [TWO_PAIRS.scenes[0]] }));
    expect((await generatorWith(merged.fetchFn).generate(FRAGMENTS, "en", hostile)).kind).toBe("invalid_output");

    const plain = fakeFetch(() => completion("ID: 1\nPROMPT: A harbor at dusk.\nIMAGE: a harbor\nVIDEO: a pan"));
    expect((await generatorWith(plain.fetchFn).generate(FRAGMENTS, "en", hostile)).kind).toBe("invalid_output");
  });
});
