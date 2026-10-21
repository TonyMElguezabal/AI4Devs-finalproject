import { describe, expect, it } from "vitest";
import { MODERATION_MAX_TIME_SECONDS, SCRIPT_MODERATION } from "../src/config/providers.ts";
import { createOpenAiScriptModerator } from "../src/scriptModeration.ts";

// moderate-script-at-submission (JOS-187), group 3 — the adapter turns the
// moderation endpoint's answer into one of three verdicts and never lets a raw
// body or a credential reach a reason.

const KEY_VALUE = "sk-test-secret-value";
const SCRIPT = "  A script with surrounding whitespace.\n";

function respondingWith(response: Response | (() => Response | Promise<Response>)) {
  const requests: { url: string; init: RequestInit }[] = [];
  const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(url), init: init ?? {} });
    return typeof response === "function" ? response() : response;
  }) as typeof fetch;
  return { fetchFn, requests };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function moderator(fetchFn: typeof fetch, loadKey: () => string = () => KEY_VALUE) {
  return createOpenAiScriptModerator({ fetchFn, loadKey });
}

describe("A moderation answer becomes a verdict", () => {
  it("is clean when the endpoint does not flag the script", async () => {
    const { fetchFn } = respondingWith(json({ results: [{ flagged: false, categories: { violence: false } }] }));

    expect(await moderator(fetchFn).moderate(SCRIPT)).toEqual({ kind: "clean" });
  });

  it("is flagged with exactly the categories that are true", async () => {
    const { fetchFn } = respondingWith(
      json({ results: [{ flagged: true, categories: { illicit: true, violence: true, hate: false } }] }),
    );

    expect(await moderator(fetchFn).moderate(SCRIPT)).toEqual({ kind: "flagged", categories: ["illicit", "violence"] });
  });
});

describe("The request", () => {
  it("is one POST with the script untrimmed, the pinned model and the bearer key", async () => {
    const { fetchFn, requests } = respondingWith(json({ results: [{ flagged: false, categories: {} }] }));

    await moderator(fetchFn).moderate(SCRIPT);

    expect(requests).toHaveLength(1);
    expect(requests[0]!.url).toBe("https://api.openai.com/v1/moderations");
    expect(requests[0]!.init.method).toBe("POST");
    expect(JSON.parse(String(requests[0]!.init.body))).toEqual({ model: SCRIPT_MODERATION.model, input: SCRIPT });
    expect((requests[0]!.init.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY_VALUE}`);
  });

  it("carries a time limit of MODERATION_MAX_TIME_SECONDS", async () => {
    const { fetchFn, requests } = respondingWith(json({ results: [{ flagged: false, categories: {} }] }));

    await moderator(fetchFn).moderate(SCRIPT);

    expect(requests[0]!.init.signal).toBeInstanceOf(AbortSignal);
    expect(MODERATION_MAX_TIME_SECONDS).toBeGreaterThan(0);
  });
});

describe("No verdict is unavailable, and says nothing it should not", () => {
  const RAW_BODY = `{"error":{"message":"raw provider detail ${KEY_VALUE}"}}`;
  const cases: { name: string; fetchFn: typeof fetch; loadKey?: () => string }[] = [
    {
      name: "a timeout",
      fetchFn: (async () => {
        throw new DOMException("timed out", "TimeoutError");
      }),
    },
    {
      name: "a network error",
      fetchFn: (async () => {
        throw new TypeError("fetch failed");
      }),
    },
    ...[429, 500, 400].map((status) => ({
      name: `HTTP ${status}`,
      fetchFn: (async () => new Response(RAW_BODY, { status })),
    })),
    {
      name: "a 200 without results[0].flagged",
      fetchFn: (async () => json({ results: [{ categories: {} }], note: RAW_BODY })),
    },
    {
      name: "a 200 that is not JSON",
      fetchFn: (async () => new Response("<html>", { status: 200 })),
    },
    {
      name: "a missing credential",
      fetchFn: (async () => json({ results: [{ flagged: false, categories: {} }] })),
      loadKey: () => {
        throw new Error("missing credential 'OPENAI_KEY': set it in the local environment or in the local secrets file");
      },
    },
  ];

  it.each(cases)("$name", async ({ fetchFn, loadKey }) => {
    const verdict = await moderator(fetchFn, loadKey).moderate(SCRIPT);

    expect(verdict.kind).toBe("unavailable");
    const reason = (verdict as { reason: string }).reason;
    expect(reason).not.toContain(KEY_VALUE);
    expect(reason).not.toContain("raw provider detail");
    expect(reason).not.toContain(SCRIPT.trim());
  });
});
