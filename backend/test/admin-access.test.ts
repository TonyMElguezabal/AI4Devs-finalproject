import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  readAdminPassword,
  registerAdminGate,
  resetAdminPasswordReader,
  setAdminPasswordReader,
} from "../src/adminAccess.ts";

// protect-admin-with-password (JOS-173), group 2 — design Decisions 1 and 3; spec `administrator-access`.
// `readAdminPassword` is checked with scratch secrets files. The gate is checked through a throwaway route
// registered the way every Administrator route is: inside a child plugin with the `/admin` prefix.

const CORRECT = "correct-horse-battery-staple";
const WRONG = "wrong-horse-battery-staple";

let dir: string;
let secretsPath: string;
let savedEnv: string | undefined;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "vid4you-admin-"));
  secretsPath = join(dir, ".secrets.json");
  savedEnv = process.env.ADMIN_PASSWORD;
  delete process.env.ADMIN_PASSWORD;
});

afterEach(() => {
  if (savedEnv === undefined) delete process.env.ADMIN_PASSWORD;
  else process.env.ADMIN_PASSWORD = savedEnv;
  resetAdminPasswordReader();
  rmSync(dir, { recursive: true, force: true });
});

describe("The Administrator password is a local secret (spec, design Decision 1)", () => {
  it("is the environment value when ADMIN_PASSWORD is set, even if the secrets file holds another", () => {
    writeFileSync(secretsPath, JSON.stringify({ ADMIN_PASSWORD: "from-the-file" }));
    process.env.ADMIN_PASSWORD = "from-the-environment";
    expect(readAdminPassword({ secretsPath })).toBe("from-the-environment");
  });

  it("is the secrets-file value when the environment has none", () => {
    writeFileSync(secretsPath, JSON.stringify({ ADMIN_PASSWORD: "from-the-file" }));
    expect(readAdminPassword({ secretsPath })).toBe("from-the-file");
  });

  it("is undefined when neither source has one", () => {
    writeFileSync(secretsPath, JSON.stringify({ OPENAI_KEY: "unrelated" }));
    expect(readAdminPassword({ secretsPath })).toBeUndefined();
  });

  it("is undefined when there is no secrets file at all", () => {
    expect(readAdminPassword({ secretsPath })).toBeUndefined();
  });

  it("counts an empty value as no password, in either source", () => {
    writeFileSync(secretsPath, JSON.stringify({ ADMIN_PASSWORD: "" }));
    process.env.ADMIN_PASSWORD = "";
    expect(readAdminPassword({ secretsPath })).toBeUndefined();
  });

  it("is undefined, not an error, when the secrets file cannot be parsed (the gate then stays closed)", () => {
    writeFileSync(secretsPath, "{ not json");
    expect(readAdminPassword({ secretsPath })).toBeUndefined();
  });
});

describe("The gate on a route under /admin/ (spec 'A wrong or missing password grants nothing')", () => {
  let app: FastifyInstance;
  let handlerRuns: string[];

  /** A throwaway route inside a child plugin with the /admin prefix, with no authentication code of its own. */
  async function appWithProbe(password: string | undefined): Promise<FastifyInstance> {
    setAdminPasswordReader(() => password);
    handlerRuns = [];
    const instance = Fastify();
    await instance.register(
      async (admin) => {
        registerAdminGate(admin);
        admin.post("/probe", async () => {
          handlerRuns.push("ran");
          return { done: true };
        });
      },
      { prefix: "/admin" },
    );
    await instance.ready();
    return instance;
  }

  afterEach(async () => {
    await app?.close();
  });

  const post = (headers: Record<string, string> = {}, payload: unknown = { any: "body" }) =>
    app.inject({ method: "POST", url: "/admin/probe", headers, payload: payload as object });

  it("answers 401 not-configured when no password is configured, with or without a header", async () => {
    app = await appWithProbe(undefined);
    const attempts: Array<Record<string, string>> = [{}, { authorization: `Bearer ${CORRECT}` }];
    for (const headers of attempts) {
      const response = await post(headers);
      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ ok: false, reason: "not-configured" });
    }
    expect(handlerRuns).toEqual([]);
  });

  it("answers 401 password-required when a password is configured and the request has no bearer value", async () => {
    app = await appWithProbe(CORRECT);
    const attempts: Array<Record<string, string>> = [{}, { authorization: "Basic abc" }, { authorization: "Bearer " }, { authorization: "Bearer" }];
    for (const headers of attempts) {
      const response = await post(headers);
      expect(response.statusCode, JSON.stringify(headers)).toBe(401);
      expect(response.json()).toEqual({ ok: false, reason: "password-required" });
    }
    expect(handlerRuns).toEqual([]);
  });

  it("answers 401 wrong-password for a different password, of any length", async () => {
    app = await appWithProbe(CORRECT);
    for (const supplied of [WRONG, "x", CORRECT.slice(0, -1), `${CORRECT}!`, "y".repeat(10_000)]) {
      const response = await post({ authorization: `Bearer ${supplied}` });
      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ ok: false, reason: "wrong-password" });
    }
    expect(handlerRuns).toEqual([]);
  });

  it("runs the handler only for the correct password", async () => {
    app = await appWithProbe(CORRECT);
    const response = await post({ authorization: `Bearer ${CORRECT}` });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ done: true });
    expect(handlerRuns).toEqual(["ran"]);
  });

  it("accepts the Bearer scheme in any letter case", async () => {
    app = await appWithProbe(CORRECT);
    const response = await post({ authorization: `bearer ${CORRECT}` });
    expect(response.statusCode).toBe(200);
  });

  it("never puts the supplied or the configured password in a 401 body", async () => {
    app = await appWithProbe(CORRECT);
    const bodies = [
      (await post({ authorization: `Bearer ${WRONG}` })).body,
      (await post()).body,
      (await post({ authorization: `Bearer ${CORRECT.slice(0, -1)}` })).body,
    ];
    for (const body of bodies) {
      expect(body).not.toContain(CORRECT);
      expect(body).not.toContain(WRONG);
    }
  });

  it("refuses before the body is parsed: a malformed body with no password is 401, not 400", async () => {
    app = await appWithProbe(CORRECT);
    const response = await app.inject({
      method: "POST",
      url: "/admin/probe",
      headers: { "content-type": "application/json" },
      payload: "{ this is not json",
    });
    expect(response.statusCode).toBe(401);
    expect(handlerRuns).toEqual([]);
  });

  it("leaves a route outside /admin/ alone", async () => {
    setAdminPasswordReader(() => CORRECT);
    const instance = Fastify();
    await instance.register(async (admin) => {
      registerAdminGate(admin);
      admin.get("/inside", async () => ({ inside: true }));
    }, { prefix: "/admin" });
    instance.get("/outside", async () => ({ outside: true }));
    await instance.ready();
    app = instance;

    expect((await app.inject({ method: "GET", url: "/outside" })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/admin/inside" })).statusCode).toBe(401);
  });
});

describe("The default reader", () => {
  it("is what the gate uses when no reader is set: the environment value grants access", async () => {
    process.env.ADMIN_PASSWORD = CORRECT;
    const instance = Fastify();
    await instance.register(async (admin) => {
      registerAdminGate(admin);
      admin.get("/probe", async () => ({ done: true }));
    }, { prefix: "/admin" });
    await instance.ready();
    try {
      expect((await instance.inject({ method: "GET", url: "/admin/probe", headers: { authorization: `Bearer ${CORRECT}` } })).statusCode).toBe(200);
      expect((await instance.inject({ method: "GET", url: "/admin/probe", headers: { authorization: `Bearer ${WRONG}` } })).statusCode).toBe(401);
    } finally {
      await instance.close();
    }
  });
});
