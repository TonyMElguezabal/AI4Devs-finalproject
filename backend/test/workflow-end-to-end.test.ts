import { existsSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { ALL_STUBS_SUCCEEDING, DEVELOPER_DATA_DIR, folderFingerprint, startWorkflowServer, waitFor, WORKFLOW_SCRIPT, type WorkflowServer } from "./workflowServer.ts";

// verify-internal-workflow (JOS-243), JOS-248 — one session from `POST /sessions` to its downloaded final video, through
// the real `node src/server.ts` with every provider stubbed. A regression in how the stages hand off fails here.

type Snapshot = { session: { state: string; phases: Array<{ phase: string; status: string }>; finalVideoUrl?: string } };

let server: WorkflowServer | undefined;
afterEach(async () => {
  await server?.stop();
  server = undefined;
});

describe("a session runs end to end against the spawned server", () => {
  it("reaches final-video with every phase complete and serves the final video", { timeout: 90_000 }, async () => {
    const dataBefore = folderFingerprint(DEVELOPER_DATA_DIR);
    server = await startWorkflowServer(ALL_STUBS_SUCCEEDING);
    const { baseUrl, scratch } = server;

    const created = await fetch(`${baseUrl}/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Workflow test", script: WORKFLOW_SCRIPT, language: "en" }),
    });
    expect(created.status, server.output()).toBe(201);
    const { sessionId } = ((await created.json()) as { session: { sessionId: string } }).session;

    const { session: done } = await waitFor(
      async () => (await (await fetch(`${baseUrl}/sessions/${sessionId}`)).json()) as Snapshot,
      (snapshot) => snapshot.session?.state === "final-video" || snapshot.session?.state === "failed",
      { timeoutMs: 60_000, intervalMs: 200, what: "the session to reach final-video" },
    );
    expect(done.state, JSON.stringify(done)).toBe("final-video");
    expect(done.phases.map(({ phase, status }) => `${phase}:${status}`)).toEqual([
      "voice-over:complete",
      "decomposition:complete",
      "scenes:complete",
      "assembly:complete",
    ]);

    const video = await fetch(`${baseUrl}${done.finalVideoUrl}`);
    expect(video.status).toBe(200);
    expect((await video.arrayBuffer()).byteLength).toBeGreaterThan(0);

    await server.stop();
    expect(existsSync(scratch)).toBe(false);
    expect(folderFingerprint(DEVELOPER_DATA_DIR)).toEqual(dataBefore);
  });
});
