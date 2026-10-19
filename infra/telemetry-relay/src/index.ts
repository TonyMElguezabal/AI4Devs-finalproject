import { ALLOWED_ATTRIBUTE_KEYS } from "./allowlist.ts";

// add-observability-telemetry (JOS-199), design Decision 6 — the relay keeps the Grafana token so the executable
// carries no secret. It accepts only OTLP/HTTP JSON on three paths, caps the size, rate-limits per IP, drops every
// attribute not on the allowlist, and forwards with Basic auth. Every response has an empty body, so no upstream
// detail and no secret can leak.
export interface Env {
  GRAFANA_OTLP_URL: string;
  GRAFANA_OTLP_AUTH: string;
  RATE_LIMITER: { limit: (options: { key: string }) => Promise<{ success: boolean }> };
}

const PATHS = new Set(["/v1/logs", "/v1/metrics", "/v1/traces"]);
const MAX_BODY_BYTES = 256 * 1024;
const ALLOWED = new Set(ALLOWED_ATTRIBUTE_KEYS);

const refuse = (status: number) => new Response(null, { status });

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (!PATHS.has(path)) return refuse(404);
    if (request.method !== "POST") return refuse(405);
    if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return refuse(415);
    if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return refuse(413);

    const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
    if (!(await env.RATE_LIMITER.limit({ key: ip })).success) return refuse(429);

    const text = await readCapped(request);
    if (text === null) return refuse(413);
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      return refuse(400);
    }

    try {
      const upstream = await fetch(env.GRAFANA_OTLP_URL + path, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Basic ${env.GRAFANA_OTLP_AUTH}` },
        body: JSON.stringify(stripAttributes(payload)),
      });
      return refuse(upstream.status);
    } catch {
      return refuse(502);
    }
  },
};

/** The body as text, or null once it passes the cap — also covers a request with no content-length. */
async function readCapped(request: Request): Promise<string | null> {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (let part = await reader.read(); !part.done; part = await reader.read()) {
    size += part.value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(part.value);
  }
  return new TextDecoder().decode(await new Blob(chunks as BlobPart[]).arrayBuffer());
}

/** Walks the whole OTLP document: any `attributes` (or exemplar `filteredAttributes`) list keeps only allowed keys. */
function stripAttributes(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(stripAttributes);
  if (node === null || typeof node !== "object") return node;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    result[key] =
      (key === "attributes" || key === "filteredAttributes") && Array.isArray(value)
        ? value.filter((attribute) => ALLOWED.has(attribute?.key)).map(stripAttributes)
        : stripAttributes(value);
  }
  return result;
}
