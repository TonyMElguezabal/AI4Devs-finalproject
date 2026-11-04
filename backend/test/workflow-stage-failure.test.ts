import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ALL_STUBS_SUCCEEDING, startWorkflowServer, waitFor, WORKFLOW_SCRIPT, type WorkflowServer } from "./workflowServer.ts";

// verify-internal-workflow (JOS-243), JOS-249 — a stage that fails for good stops the session where it failed: it never
// hangs, never assembles, and leaves an `error` line in the local log file.

type Snapshot = {
  session: { state: string; phases: Array<{ phase: string; status: string }>; finalVideoUrl?: string };
  scenes: Array<{ state: string; affectedStage?: string }>;
};

let server: WorkflowServer | undefined;
afterEach(async () => {
  await server?.stop();
  server = undefined;
});

describe("a permanent image failure stops the session cleanly", () => {
  it("fails every scene on the image stage, never reaches assembly, and logs the failure", { timeout: 90_000 }, async () => {
    server = await startWorkflowServer({ ...ALL_STUBS_SUCCEEDING, USE_STUB_IMAGE_PROVIDER: "not-retryable-failure" });
    const { baseUrl, scratch } = server;

    const created = await fetch(`${baseUrl}/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Workflow failure test", script: WORKFLOW_SCRIPT, language: "en" }),
    });
    expect(created.status, server.output()).toBe(201);
    const { sessionId } = ((await created.json()) as { session: { sessionId: string } }).session;

    const stopped = await waitFor(
      async () => (await (await fetch(`${baseUrl}/sessions/${sessionId}`)).json()) as Snapshot,
      (snapshot) => (snapshot.scenes?.length ?? 0) > 0 && snapshot.scenes.every((scene) => scene.state === "failed"),
      { timeoutMs: 60_000, intervalMs: 200, what: "every scene to fail" },
    );
    expect(stopped.scenes.every((scene) => scene.affectedStage === "image"), JSON.stringify(stopped.scenes)).toBe(true);
    // The scene completion gate holds assembly until every scene is complete, so no wait is needed to prove it never ran.
    expect(stopped.session.phases.find(({ phase }) => phase === "assembly")?.status).toBe("pending");
    expect(stopped.session.finalVideoUrl).toBeUndefined();

    const logFile = join(scratch, "logs", "vid4you.log");
    expect(existsSync(logFile), server.output()).toBe(true);
    const errorLines = readFileSync(logFile, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { level: number; stage?: string })
      .filter((record) => record.level === 50 && record.stage === "image");
    expect(errorLines.length).toBeGreaterThan(0);

    await server.stop();
    expect(existsSync(scratch)).toBe(false);
  });
});
