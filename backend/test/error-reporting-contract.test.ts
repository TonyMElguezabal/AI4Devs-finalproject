import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { startFakeOtlpReceiver, type FakeOtlpReceiver, type ReceivedLogRecord } from "./fakeOtlpReceiver.ts";
import { ALL_STUBS_SUCCEEDING, startWorkflowServer, waitFor, WORKFLOW_SCRIPT, type WorkflowServer } from "./workflowServer.ts";

// cover-error-reporting (JOS-255), design D5 — the real `node src/server.ts`, its OTLP endpoint pointed at a fake
// receiver. Each error class is triggered once: a route crash, a not-retryable stage failure, a frontend report and,
// last because it ends the process, an unhandled rejection. Each must reach the log file; with consent, the receiver too.

const TAG = "contract";

type LogLine = { level: number; msg?: string; stage?: string; errorCode?: string };

let server: WorkflowServer | undefined;
let receiver: FakeOtlpReceiver | undefined;
afterEach(async () => {
  await server?.stop();
  await receiver?.close();
  server = receiver = undefined;
});

async function triggerEveryErrorClass(errors: boolean): Promise<LogLine[]> {
  receiver = await startFakeOtlpReceiver();
  server = await startWorkflowServer({
    ...ALL_STUBS_SUCCEEDING,
    USE_STUB_IMAGE_PROVIDER: "not-retryable-failure",
    VID4YOU_TELEMETRY_ENDPOINT: receiver.url,
    VID4YOU_ERROR_TRIGGERS: "1",
  });
  const { baseUrl, scratch } = server;
  const send = (method: string, path: string, body?: unknown) =>
    fetch(`${baseUrl}${path}`, { method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });

  expect((await send("PUT", "/telemetry/consent", { errors, providerUsage: false, productUsage: false })).status).toBe(200);

  expect((await send("POST", "/dev/errors/route-crash", { tag: TAG })).status).toBe(500);

  const created = await send("POST", "/sessions", { title: "Error contract test", script: WORKFLOW_SCRIPT, language: "en" });
  expect(created.status, server.output()).toBe(201);
  const { sessionId } = ((await created.json()) as { session: { sessionId: string } }).session;
  await waitFor(
    async () => (await (await send("GET", `/sessions/${sessionId}`)).json()) as { scenes?: Array<{ state: string }> },
    (snapshot) => (snapshot.scenes?.length ?? 0) > 0 && snapshot.scenes!.every((scene) => scene.state === "failed"),
    { timeoutMs: 60_000, intervalMs: 200, what: "the image stage to fail" },
  );

  expect((await send("POST", "/telemetry/frontend-errors", { kind: "render", message: `synthetic frontend error ${TAG}` })).status).toBe(204);

  expect((await send("POST", "/dev/errors/unhandled-rejection", { tag: TAG })).status).toBe(202);
  await waitFor(
    () => send("GET", "/health").then(() => "up", () => "down"),
    (state) => state === "down",
    { timeoutMs: 15_000, intervalMs: 100, what: "the process to exit after the unhandled rejection" },
  );

  return readFileSync(join(scratch, "logs", "vid4you.log"), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as LogLine)
    .filter((line) => line.level === 50);
}

function expectEveryClassInTheLog(errorLines: LogLine[]): void {
  const summary = JSON.stringify(errorLines);
  expect(errorLines.some((line) => line.stage === "api" && line.errorCode === "SYNTHETIC_ERROR"), summary).toBe(true);
  expect(errorLines.some((line) => line.stage === "image"), summary).toBe(true);
  expect(errorLines.some((line) => line.stage === "frontend" && line.errorCode === "render"), summary).toBe(true);
  expect(errorLines.some((line) => line.stage === undefined && line.msg === `synthetic unhandled rejection ${TAG}`), summary).toBe(true);
}

describe("every error class leaves the app", () => {
  it("reaches the log file and the OTLP export when error consent is on", { timeout: 120_000 }, async () => {
    const errorLines = await triggerEveryErrorClass(true);
    expectEveryClassInTheLog(errorLines);

    // The rejection's record is flushed before the process exits; earlier ones leave with the batch processor.
    const records = await waitFor(
      () => Promise.resolve(receiver!.records()),
      (all) => all.some((record) => record.body === `synthetic unhandled rejection ${TAG}`),
      { timeoutMs: 10_000, intervalMs: 100, what: "the unhandled rejection's record at the receiver" },
    );
    const has = (match: (record: ReceivedLogRecord) => boolean) => expect(records.some(match), JSON.stringify(records)).toBe(true);
    has((record) => record.attributes.stage === "api" && record.attributes["error.code"] === "SYNTHETIC_ERROR" && record.attributes.route === "POST /dev/errors/route-crash");
    has((record) => record.attributes.stage === "image" && record.attributes.provider === "stub");
    has((record) => record.attributes.stage === "frontend" && record.attributes["error.code"] === "render");
    has((record) => record.attributes["error.code"] === "Error" && record.attributes.stage === undefined && record.body.includes(TAG));
  });

  it("reaches the log file and sends nothing when error consent is off", { timeout: 120_000 }, async () => {
    const errorLines = await triggerEveryErrorClass(false);
    expectEveryClassInTheLog(errorLines);

    expect(receiver!.records()).toEqual([]);
  });
});
