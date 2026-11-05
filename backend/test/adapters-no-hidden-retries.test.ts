import { describe, expect, it } from "vitest";
import { createOpenAiScriptModerator } from "../src/scriptModeration.ts";

// bounded-retry-policy (JOS-184), group 5 — Decision 6: the retry policy's
// budget is the only retry mechanism. An adapter makes exactly one provider
// request per call, so a failing call is made once, whatever the failure:
// a transient status, a rate limit, a not-retryable status or a network error.
// A hidden retry inside an adapter would multiply the budget of four attempts.
// Every adapter type is held to this by adapter-contract.test.ts (JOS-263). Script moderation is not an adapter type
// (it has no profile), so its case stays here.

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
  it("script moderation: one request", async () => {
    const { fetchFn, calls } = countingFetch(failure);

    await createOpenAiScriptModerator({ fetchFn, loadKey: KEY }).moderate("A script.");

    expect(calls).toHaveLength(1);
  });
});
