// JOS-194 proof of concept — Worker for option B + F3 (design § Execution Record §3-§4).
// Serves the static build, forwards /api/* (prefix stripped) to the single container instance.
import { Container, getContainer } from "@cloudflare/containers";

interface Env {
  BACKEND: DurableObjectNamespace<Vid4YouBackend>;
  ASSETS: Fetcher;
  R2_ACCOUNT_ID: string;
  R2_BUCKET_NAME: string;
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
  POC_MODE: string;
  POC_KEEPALIVE?: string;
  POC_SLEEP_AFTER?: string;
  POC_STUB_VIDEO_DELAY_MS?: string;
  ALLOW_TEST_ENDPOINTS?: string;
  OPENAI_KEY?: string;
  ELEVENLABS_KEY?: string;
  FAL_API_KEY?: string;
  RUNNINGHUB_API_KEY?: string;
}

export class Vid4YouBackend extends Container<Env> {
  defaultPort = 8080;
  // PoC: short on purpose, so experiment 7.14 can wait past it. The schedule below renews it every minute while the backend lives.
  // ponytail: always-on keep-alive (the backend progresses sessions with no incoming request); make it conditional on in-flight work if idle cost ever matters.
  sleepAfter = "10m";

  // ponytail: `{}` mirrors the library's own constructor type; drop when the library and workers-types agree.
  constructor(ctx: DurableObjectState<{}>, env: Env) {
    super(ctx, env);
    const forwarded: Record<string, string | undefined> = {
      R2_ACCOUNT_ID: env.R2_ACCOUNT_ID,
      R2_BUCKET_NAME: env.R2_BUCKET_NAME,
      AWS_ACCESS_KEY_ID: env.AWS_ACCESS_KEY_ID,
      AWS_SECRET_ACCESS_KEY: env.AWS_SECRET_ACCESS_KEY,
      POC_MODE: env.POC_MODE,
      POC_STUB_VIDEO_DELAY_MS: env.POC_STUB_VIDEO_DELAY_MS,
      ALLOW_TEST_ENDPOINTS: env.ALLOW_TEST_ENDPOINTS,
      OPENAI_KEY: env.OPENAI_KEY,
      ELEVENLABS_KEY: env.ELEVENLABS_KEY,
      FAL_API_KEY: env.FAL_API_KEY,
      RUNNINGHUB_API_KEY: env.RUNNINGHUB_API_KEY,
    };
    // Unset must stay unset: the backend treats any non-empty value (even "false") as enabled (design §1.2, finding 3).
    if (env.POC_SLEEP_AFTER) this.sleepAfter = env.POC_SLEEP_AFTER; // experiment knob, default "10m"
    this.envVars = Object.fromEntries(Object.entries(forwarded).filter(([, v]) => v !== undefined && v !== "")) as Record<string, string>;
  }

  // Keep-alive: when the inactivity timeout expires, renew it instead of stopping (the library's default). The backend progresses
  // sessions with no incoming request, so a sleeping instance would stall them. POC_KEEPALIVE=0 restores the default for the control run.
  override async onActivityExpired(): Promise<void> {
    if (this.env.POC_KEEPALIVE === "0") return super.onActivityExpired();
    console.log("poc: activity expired; renewing instead of stopping");
    this.renewActivityTimeout();
  }

  // Schedules created by earlier PoC versions may still be stored; they must not reschedule themselves.
  async keepAlive(): Promise<void> {}
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    // PoC-only controls (behind Access): drive the instance lifecycle for experiments 6.14, 7.4, 7.13, 7.14. Remove with the PoC.
    if (url.pathname.startsWith("/__poc/")) {
      const stub = getContainer(env.BACKEND, "singleton");
      const action = url.pathname.slice("/__poc/".length);
      if (action === "state") return Response.json(await stub.getState());
      if (action === "logs") return stub.containerFetch(new Request("http://container/logs"), 8081);
      if (action === "uptime") return stub.containerFetch(new Request("http://container/uptime"), 8081);
      if (action === "stop") { await stub.stop(); return Response.json({ stopped: "SIGTERM" }); }
      if (action === "kill") { await stub.destroy(); return Response.json({ destroyed: "SIGKILL" }); }
      return new Response("unknown poc action", { status: 404 });
    }
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      url.pathname = url.pathname.slice("/api".length) || "/";
      return getContainer(env.BACKEND, "singleton").fetch(new Request(url, request));
    }
    return env.ASSETS.fetch(request);
  },
};
