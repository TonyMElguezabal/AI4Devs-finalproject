import { beforeEach, describe, expect, it, vi } from "vitest";
import relay, { type Env } from "../src/index.ts";
import { ALLOWED_ATTRIBUTE_KEYS } from "../src/allowlist.ts";

// add-observability-telemetry (JOS-199), group 6 — Decision 6: a stateless filter-and-forward handler.
const TOKEN = "s3cr3t-token";
const upstream = vi.fn(async (_url: string, _init: RequestInit) => new Response("upstream body with details", { status: 202 }));
let limitResult = true;
const env: Env = {
  GRAFANA_OTLP_URL: "https://otlp.example.grafana.net/otlp",
  GRAFANA_OTLP_AUTH: TOKEN,
  RATE_LIMITER: { limit: async () => ({ success: limitResult }) },
};

const metricsPayload = {
  resourceMetrics: [
    {
      resource: {
        attributes: [
          { key: "service.name", value: { stringValue: "vid4you" } },
          { key: "session.title", value: { stringValue: "My secret trip" } },
        ],
      },
      scopeMetrics: [
        {
          scope: { name: "vid4you", attributes: [{ key: "file.path", value: { stringValue: "/Users/ana/x" } }] },
          metrics: [
            {
              name: "vid4you_provider_calls_total",
              sum: { dataPoints: [{ asInt: "1", attributes: [{ key: "stage", value: { stringValue: "video" } }, { key: "script", value: { stringValue: "text" } }] }] },
            },
          ],
        },
      ],
    },
  ],
};

function post(path: string, body: unknown, headers: Record<string, string> = { "content-type": "application/json" }) {
  return relay.fetch(
    new Request(`https://otel.vid4you.download${path}`, {
      method: "POST",
      headers,
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    env,
  );
}

beforeEach(() => {
  upstream.mockClear();
  limitResult = true;
  vi.stubGlobal("fetch", upstream);
});

describe("accepted exports", () => {
  it.each(["/v1/metrics", "/v1/logs", "/v1/traces"])("forwards %s with Basic auth and returns the upstream status", async (path) => {
    const res = await post(path, metricsPayload);
    expect(res.status).toBe(202);
    expect(await res.text()).toBe("");
    const [url, init] = upstream.mock.calls[0]!;
    expect(url).toBe(`https://otlp.example.grafana.net/otlp${path}`);
    expect((init.headers as Record<string, string>).authorization).toBe(`Basic ${TOKEN}`);
    expect(init.method).toBe("POST");
  });

  it("accepts a content type with a charset", async () => {
    const res = await post("/v1/metrics", metricsPayload, { "content-type": "application/json; charset=utf-8" });
    expect(res.status).toBe(202);
  });
});

describe("refused requests forward nothing and never reveal the token", () => {
  const cases: Array<[string, () => Promise<Response>, number]> = [
    ["wrong path", () => post("/v1/other", metricsPayload), 404],
    ["wrong method", () => relay.fetch(new Request("https://otel.vid4you.download/v1/metrics", { method: "GET" }), env), 405],
    ["protobuf", () => post("/v1/metrics", "x", { "content-type": "application/x-protobuf" }), 415],
    ["oversized body", () => post("/v1/metrics", "x".repeat(256 * 1024 + 1)), 413],
    ["invalid JSON", () => post("/v1/metrics", "{not json"), 400],
  ];

  it.each(cases)("%s", async (_name, send, status) => {
    const res = await send();
    expect(res.status).toBe(status);
    expect(upstream).not.toHaveBeenCalled();
    expect(await res.text()).not.toContain(TOKEN);
    expect(JSON.stringify([...res.headers])).not.toContain(TOKEN);
  });

  it("answers 429 when the client is over the rate limit", async () => {
    limitResult = false;
    const res = await post("/v1/metrics", metricsPayload);
    expect(res.status).toBe(429);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("answers 502 without detail when the upstream is unreachable", async () => {
    upstream.mockRejectedValueOnce(new Error(`connect failed with ${TOKEN}`));
    const res = await post("/v1/metrics", metricsPayload);
    expect(res.status).toBe(502);
    expect(await res.text()).not.toContain(TOKEN);
  });
});

describe("attribute allowlist", () => {
  it("strips every attribute key that is not allowed, at every level", async () => {
    await post("/v1/metrics", metricsPayload);
    const forwarded = JSON.parse(String(upstream.mock.calls[0]![1].body));
    const keys: string[] = [];
    JSON.stringify(forwarded, (key, value) => {
      if (key === "attributes" && Array.isArray(value)) keys.push(...value.map((a: { key: string }) => a.key));
      return value;
    });
    expect(keys.sort()).toEqual(["service.name", "stage"]);
    expect(keys.every((key) => ALLOWED_ATTRIBUTE_KEYS.includes(key))).toBe(true);
    expect(JSON.stringify(forwarded)).not.toContain("My secret trip");
  });

  it("strips log-record attributes too", async () => {
    const logs = {
      resourceLogs: [{ scopeLogs: [{ logRecords: [{ body: { stringValue: "m" }, attributes: [{ key: "exception.message", value: { stringValue: "m" } }, { key: "script", value: { stringValue: "s" } }] }] }] }],
    };
    await post("/v1/logs", logs);
    const record = JSON.parse(String(upstream.mock.calls[0]![1].body)).resourceLogs[0].scopeLogs[0].logRecords[0];
    expect(record.attributes.map((a: { key: string }) => a.key)).toEqual(["exception.message"]);
  });
});
