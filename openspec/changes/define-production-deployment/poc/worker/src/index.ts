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
  ALLOW_TEST_ENDPOINTS?: string;
  OPENAI_KEY?: string;
  ELEVENLABS_KEY?: string;
  FAL_API_KEY?: string;
  RUNNINGHUB_API_KEY?: string;
}

const KEEP_ALIVE_SECONDS = 60;

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
      ALLOW_TEST_ENDPOINTS: env.ALLOW_TEST_ENDPOINTS,
      OPENAI_KEY: env.OPENAI_KEY,
      ELEVENLABS_KEY: env.ELEVENLABS_KEY,
      FAL_API_KEY: env.FAL_API_KEY,
      RUNNINGHUB_API_KEY: env.RUNNINGHUB_API_KEY,
    };
    // Unset must stay unset: the backend treats any non-empty value (even "false") as enabled (design §1.2, finding 3).
    this.envVars = Object.fromEntries(Object.entries(forwarded).filter(([, v]) => v !== undefined && v !== "")) as Record<string, string>;
  }

  override async onStart(): Promise<void> {
    await this.schedule(KEEP_ALIVE_SECONDS, "keepAlive");
  }

  async keepAlive(): Promise<void> {
    this.renewActivityTimeout();
    await this.schedule(KEEP_ALIVE_SECONDS, "keepAlive");
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      url.pathname = url.pathname.slice("/api".length) || "/";
      return getContainer(env.BACKEND, "singleton").fetch(new Request(url, request));
    }
    return env.ASSETS.fetch(request);
  },
};
