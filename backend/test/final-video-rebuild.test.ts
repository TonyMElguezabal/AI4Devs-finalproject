import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import {
  clearScenePauseEdit,
  createRun,
  getFinalVideoBuilds,
  getRun,
  getStageAttempts,
  resolveArtefactPath,
  setScenePauseEdit,
} from "../src/db.ts";
import { rebuildFinalVideo } from "../src/finalVideoRebuild.ts";
import {
  RETRY_BUDGET,
  assemblyStageLauncher,
  continueSession,
  pauseSession,
  recoverOnBoot,
  toSnapshot,
} from "../src/orchestrator.ts";
import { SCRIPT, finishedSession, resetRebuildEnvironment, waitFor } from "./rebuildFixtures.ts";

// adjust-scene-pause (JOS-190), group 6 — design Decisions 6-8: a rebuild is a fresh assembly cycle that applies the
// stored pause edits, writes a new versioned file, never replaces an earlier one, and never marks the session failed.

beforeEach(resetRebuildEnvironment);

describe("a rebuild applies the stored edits in a new version (design Decision 6)", () => {
  it("opens a fresh cycle, passes shifted intervals and the narration edit, and writes final-video-2.mp4", async () => {
    const { runId, sceneIds, calls } = await finishedSession();
    setScenePauseEdit(runId, sceneIds[0]!, 3.3); // scene 1: 4.3 s -> 3.3 s, 1.0 s trimmed

    const result = rebuildFinalVideo(runId);

    expect(result).toEqual({ ok: true, held: false });
    await waitFor(() => getRun(runId)?.finalVideoPath === "final-video-2.mp4");
    const rebuildCall = calls.at(-1)!;
    expect(calls).toHaveLength(2);
    expect(rebuildCall.clips.map((clip) => [clip.narrationStartSeconds, clip.narrationDurationSeconds])).toEqual([
      [0, 4],
      [4, 5],
    ]);
    expect(rebuildCall.clips.map((clip) => clip.frameCount)).toEqual([120, 150]);
    expect(rebuildCall.narrationEdits).toHaveLength(1);
    expect(rebuildCall.narrationEdits![0]!.atSeconds).toBeCloseTo(2.85, 6); // 5 s - 4.3 s / 2
    expect(rebuildCall.narrationEdits![0]!.deltaSeconds).toBeCloseTo(-1, 6);
    expect(getStageAttempts(runId, "assembly").map((attempt) => attempt.cycle)).toEqual([1, 2]);
  });

  it("keeps the first file, records the build with the edits it used, and clears the request", async () => {
    const { runId, sceneIds } = await finishedSession();
    setScenePauseEdit(runId, sceneIds[0]!, 3.3);

    rebuildFinalVideo(runId);
    await waitFor(() => getRun(runId)?.finalVideoPath === "final-video-2.mp4");

    const run = getRun(runId)!;
    expect(existsSync(resolveArtefactPath(run.projectFolder, "final-video.mp4"))).toBe(true);
    expect(existsSync(resolveArtefactPath(run.projectFolder, "final-video-2.mp4"))).toBe(true);
    expect(getFinalVideoBuilds(runId)).toEqual([
      expect.objectContaining({ version: 2, path: "final-video-2.mp4", pauses: { [sceneIds[0]!]: 3.3 } }),
    ]);
    expect(run.rebuildRequestedAt).toBeNull();
    expect(run.failure).toBeNull();
  });

  it("numbers a second rebuild 3 and keeps both earlier files", async () => {
    const { runId, sceneIds } = await finishedSession();
    setScenePauseEdit(runId, sceneIds[0]!, 3.3);
    rebuildFinalVideo(runId);
    await waitFor(() => getRun(runId)?.finalVideoPath === "final-video-2.mp4");

    setScenePauseEdit(runId, sceneIds[1]!, 2.0);
    expect(rebuildFinalVideo(runId)).toEqual({ ok: true, held: false });
    await waitFor(() => getRun(runId)?.finalVideoPath === "final-video-3.mp4");

    const run = getRun(runId)!;
    for (const file of ["final-video.mp4", "final-video-2.mp4", "final-video-3.mp4"]) {
      expect(existsSync(resolveArtefactPath(run.projectFolder, file))).toBe(true);
    }
    expect(getFinalVideoBuilds(runId).map((build) => build.version)).toEqual([2, 3]);
  });

  it("refuses with the reasons in the spec", async () => {
    const { runId, sceneIds, setMode } = await finishedSession();

    expect(rebuildFinalVideo(randomUUID())).toEqual({ ok: false, reason: "session-not-found" });
    expect(rebuildFinalVideo(runId)).toEqual({ ok: false, reason: "nothing-to-rebuild" });

    setScenePauseEdit(runId, sceneIds[0]!, 3.3);
    setMode({ slowMs: 300 });
    expect(rebuildFinalVideo(runId)).toEqual({ ok: true, held: false });
    expect(rebuildFinalVideo(runId)).toEqual({ ok: false, reason: "assembly-in-progress" });
    await waitFor(() => getRun(runId)?.finalVideoPath === "final-video-2.mp4");
    // The edits now equal those the current video was built with.
    expect(rebuildFinalVideo(runId)).toEqual({ ok: false, reason: "nothing-to-rebuild" });
  });

  it("refuses a session with no final video", () => {
    const runId = randomUUID();
    createRun(runId, "No video yet", SCRIPT, "en");

    expect(rebuildFinalVideo(runId)).toEqual({ ok: false, reason: "no-final-video" });
  });

  it("counts an edit removed back to the original as nothing to rebuild after a rebuild", async () => {
    const { runId, sceneIds } = await finishedSession();
    setScenePauseEdit(runId, sceneIds[0]!, 3.3);
    rebuildFinalVideo(runId);
    await waitFor(() => getRun(runId)?.finalVideoPath === "final-video-2.mp4");

    clearScenePauseEdit(sceneIds[0]!);

    // The current video was built with an edit the User has since undone: that is a pending change.
    expect(rebuildFinalVideo(runId)).toEqual({ ok: true, held: false });
    await waitFor(() => getRun(runId)?.finalVideoPath === "final-video-3.mp4");
  });
});

describe("failure and state (design Decisions 6-7)", () => {
  it("keeps the previous final video, sets no session failure, and lets the User try again", async () => {
    const { runId, sceneIds, calls, setMode } = await finishedSession();
    setScenePauseEdit(runId, sceneIds[0]!, 3.3);
    setMode("transient");

    rebuildFinalVideo(runId);
    await waitFor(() => getStageAttempts(runId, "assembly").length === 1 + 1 + RETRY_BUDGET);

    await waitFor(() => getRun(runId)?.rebuildRequestedAt === null);
    const run = getRun(runId)!;
    expect(run.finalVideoPath).toBe("final-video.mp4");
    expect(run.failure).toBeNull();
    expect(existsSync(resolveArtefactPath(run.projectFolder, "final-video-2.mp4"))).toBe(false);
    expect(calls).toHaveLength(1 + 1 + RETRY_BUDGET);
    const snapshot = toSnapshot(runId)!;
    expect(snapshot.session.state).toBe("final-video");
    expect(snapshot.session.finalVideoUrl).toBeDefined();

    setMode("success");
    expect(rebuildFinalVideo(runId)).toEqual({ ok: true, held: false });
    await waitFor(() => getRun(runId)?.finalVideoPath === "final-video-2.mp4");
  });

  it("does not retry a not-retryable failure, and still never fails the session", async () => {
    const { runId, sceneIds, calls, setMode } = await finishedSession();
    setScenePauseEdit(runId, sceneIds[0]!, 3.3);
    setMode("not-retryable");

    rebuildFinalVideo(runId);
    await waitFor(() => getRun(runId)?.rebuildRequestedAt === null);

    expect(calls).toHaveLength(2);
    expect(getRun(runId)!.failure).toBeNull();
    expect(getRun(runId)!.finalVideoPath).toBe("final-video.mp4");
  });

  it("derives final-video-generating, with the previous video still offered, while a rebuild runs", async () => {
    const { runId, sceneIds, setMode } = await finishedSession();
    setScenePauseEdit(runId, sceneIds[0]!, 3.3);
    setMode({ slowMs: 400 });

    rebuildFinalVideo(runId);
    await waitFor(() => getStageAttempts(runId, "assembly").at(-1)?.outcome === "in-flight");

    const during = toSnapshot(runId)!.session;
    expect(during.state).toBe("final-video-generating");
    expect(during.phases.find((phase) => phase.phase === "assembly")?.status).toBe("in-progress");
    expect(during.finalVideoUrl).toBeDefined();

    await waitFor(() => getRun(runId)?.finalVideoPath === "final-video-2.mp4");
    expect(toSnapshot(runId)!.session.state).toBe("final-video");
  });

  it("holds a rebuild requested while paused, counts it as held work, and runs it on continue", async () => {
    const { runId, sceneIds, calls } = await finishedSession();
    setScenePauseEdit(runId, sceneIds[0]!, 3.3);
    pauseSession(runId);

    expect(rebuildFinalVideo(runId)).toEqual({ ok: true, held: true });

    expect(calls).toHaveLength(1);
    expect(assemblyStageLauncher.heldWork(runId).count).toBe(1);
    expect(getRun(runId)!.rebuildRequestedAt).not.toBeNull();
    continueSession(runId);
    await waitFor(() => getRun(runId)?.finalVideoPath === "final-video-2.mp4");
    expect(calls).toHaveLength(2);
  });
});

describe("restart (design Decision 8)", () => {
  it("settles an interrupted rebuild as a failed attempt, keeps the current video and relaunches nothing", async () => {
    const { runId, sceneIds, calls, setMode } = await finishedSession();
    setScenePauseEdit(runId, sceneIds[0]!, 3.3);
    setMode({ slowMs: 5000 });
    rebuildFinalVideo(runId);
    await waitFor(() => getStageAttempts(runId, "assembly").at(-1)?.outcome === "in-flight");

    recoverOnBoot();

    const latest = getStageAttempts(runId, "assembly").at(-1)!;
    expect(latest.outcome).toBe("transient");
    expect(latest.errorMessage).toBe("interrupted by a restart");
    const run = getRun(runId)!;
    expect(run.finalVideoPath).toBe("final-video.mp4");
    expect(run.failure).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(calls).toHaveLength(2); // the first assembly and the interrupted rebuild; nothing relaunched
  });
});
