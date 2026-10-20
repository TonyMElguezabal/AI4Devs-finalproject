import type { FastifyInstance } from "fastify";

// Checkpoint 2 security finding: the API has no authentication (PRD C9), so it must not answer a web page the
// user happens to visit. A browser always sends `Origin` on cross-site requests, so refusing every origin that
// is not the app's own closes both reading (CORS) and blind writes (an empty POST needs no preflight).
// A foreign `Host` (DNS rebinding) is refused for the same reason.

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);
const DEV_FRONTEND_PORT = 5173;

/** The origins allowed to call the API: the Vite dev server and the backend's own address, plus `CORS_ALLOWED_ORIGINS` (comma-separated). */
export function allowedOrigins(port: number, extra = process.env.CORS_ALLOWED_ORIGINS ?? ""): string[] {
  const own = [DEV_FRONTEND_PORT, port].flatMap((p) => [`http://127.0.0.1:${p}`, `http://localhost:${p}`]);
  return [...own, ...extra.split(",").map((origin) => origin.trim()).filter(Boolean)];
}

function hostname(hostHeader: string | undefined): string {
  return (hostHeader ?? "").replace(/:\d+$/, "").toLowerCase();
}

export function registerOriginPolicy(app: FastifyInstance, port: number): void {
  const allowed = new Set(allowedOrigins(port));
  app.addHook("onRequest", async (request, reply) => {
    const origin = request.headers.origin;
    if (!LOOPBACK_HOSTS.has(hostname(request.headers.host)) || (origin !== undefined && !allowed.has(origin))) {
      return reply.code(403).send({ error: "origin not allowed" });
    }
  });
}
