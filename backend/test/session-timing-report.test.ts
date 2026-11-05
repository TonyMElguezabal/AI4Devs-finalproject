import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTimingReport, loadTimingReport, type AttemptRow, type SceneRow } from "../scripts/sessionTimingReport.ts";

// time-full-size-session (JOS-209), tasks 2.1 to 2.4 — the report is a pure function over stored rows.
const LIMITS = { "voice-over": 600, timestamps: 5, decomposition: 600, image: 120, video: 1200, assembly: null };
const at = (seconds: number): string => new Date(Date.UTC(2026, 9, 27, 12, 0, seconds)).toISOString();
const attempt = (stage: string, sceneId: string | null, attemptNumber: number, sentS: number, finishedS: number | null, outcome: string): AttemptRow => ({
  stage, sceneId, attemptNumber, sentAt: at(sentS), finishedAt: finishedS === null ? null : at(finishedS), outcome,
});
const stageRow = (rows: AttemptRow[], stage: string, scenes: SceneRow[] = []) => buildTimingReport({ attempts: rows, scenes, limits: LIMITS }).stages.find((row) => row.stage === stage)!;

describe("stage table", () => {
  it("counts attempts and timed-out attempts and spans the first send to the last finish", () => {
    const row = stageRow([attempt("voice-over", null, 1, 0, 600, "timed-out"), attempt("voice-over", null, 2, 610, 760, "success")], "voice-over");
    expect(row).toMatchObject({ attempts: 2, timedOut: 1, elapsedSeconds: 760 });
  });

  it("shows no time and no attempts for a stage that never ran", () => {
    expect(stageRow([], "assembly")).toMatchObject({ attempts: 0, timedOut: 0, elapsedSeconds: null, slowestSuccessSeconds: null });
  });
});

describe("clip table", () => {
  const scenes: SceneRow[] = [{ id: "s1", idx: 0, requestedDurationSeconds: 11 }, { id: "s2", idx: 1, requestedDurationSeconds: 7 }];

  it("gives the requested duration, the generation time of the successful attempt, attempts and outcome", () => {
    const { clips } = buildTimingReport({ attempts: [attempt("video", "s1", 1, 0, 1200, "timed-out"), attempt("video", "s1", 2, 1210, 1750, "success")], scenes, limits: LIMITS });
    expect(clips[0]).toEqual({ sceneIndex: 0, requestedDurationSeconds: 11, generationSeconds: 540, attempts: 2, outcome: "success" });
  });

  it("shows no generation time for a clip without a success and the last attempt's outcome", () => {
    const { clips } = buildTimingReport({ attempts: [attempt("video", "s2", 1, 0, 1200, "timed-out"), attempt("video", "s2", 2, 1210, 1300, "not-retryable")], scenes, limits: LIMITS });
    expect(clips[1]).toMatchObject({ generationSeconds: null, attempts: 2, outcome: "not-retryable" });
  });

  it("shows a clip with no video attempt as not attempted", () => {
    expect(buildTimingReport({ attempts: [], scenes, limits: LIMITS }).clips[0]).toMatchObject({ attempts: 0, generationSeconds: null, outcome: "not attempted" });
  });
});

describe("limit margin", () => {
  const video = (...rows: AttemptRow[]) => stageRow(rows, "video");

  it("is the limit over the slowest successful time when an attempt timed out", () => {
    expect(video(attempt("video", "s1", 1, 0, 1200, "timed-out"), attempt("video", "s2", 1, 0, 960, "success"), attempt("video", "s3", 1, 0, 400, "success")))
      .toMatchObject({ slowestSuccessSeconds: 960, margin: 1.25 });
  });

  it("is not computable when attempts timed out and none succeeded", () => {
    expect(video(attempt("video", "s1", 1, 0, 1200, "timed-out")).margin).toBe("not computable");
  });

  it("is absent, with the slowest time still given, when nothing timed out", () => {
    expect(video(attempt("video", "s1", 1, 0, 500, "success"))).toMatchObject({ slowestSuccessSeconds: 500, margin: null });
  });

  it("leaves a late success out of the slowest successful time", () => {
    expect(video(attempt("video", "s1", 1, 0, 1200, "timed-out"), attempt("video", "s1", 2, 0, 1500, "late-success"), attempt("video", "s2", 1, 0, 800, "success")).slowestSuccessSeconds).toBe(800);
  });

  it("has no margin for a stage without a limit", () => {
    expect(stageRow([attempt("assembly", null, 1, 0, 30, "timed-out"), attempt("assembly", null, 2, 40, 90, "success")], "assembly").margin).toBeNull();
  });
});

describe("database access", () => {
  let dir: string;
  let file: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "vid4you-timing-"));
    file = join(dir, "app.db");
    const seed = new DatabaseSync(file);
    seed.exec(`CREATE TABLE runs (id TEXT PRIMARY KEY);
      CREATE TABLE scenes (id TEXT PRIMARY KEY, run_id TEXT, idx INTEGER, requested_duration_seconds INTEGER);
      CREATE TABLE stage_attempts (run_id TEXT, stage TEXT, scene_id TEXT, attempt_number INTEGER, sent_at TEXT, finished_at TEXT, outcome TEXT);
      INSERT INTO runs VALUES ('r1');
      INSERT INTO scenes VALUES ('s1', 'r1', 0, 9);
      CREATE TABLE provider_requests (id TEXT PRIMARY KEY, scene_id TEXT, stage TEXT, sent_at TEXT, latency_ms INTEGER, mode TEXT, attempt_number INTEGER);
      INSERT INTO stage_attempts VALUES ('r1', 'video', 's1', 1, '${at(0)}', '${at(999)}', 'success');
      INSERT INTO provider_requests VALUES ('p1', 's1', 'video', '${at(0)}', 300000, 'success', 1),
        ('p2', 's1', 'image', '${at(0)}', 120000, 'transient_failure', 1),
        ('p3', 's1', 'image', '${at(130)}', 40000, 'transient_failure', 2),
        ('p4', 's1', 'image', '${at(180)}', 90000, 'success', 3);`);
    seed.close();
  });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it("reads the session's rows and leaves the file byte-identical", () => {
    const before = readFileSync(file);
    const report = loadTimingReport(file, "r1", LIMITS);
    expect(report.clips[0]).toMatchObject({ requestedDurationSeconds: 9, generationSeconds: 300 });
    expect(readFileSync(file).equals(before)).toBe(true);
  });

  it("reads image and video attempts from the request log, counting a failure at the limit as timed out, and ignores stage_attempts rows of those stages", () => {
    const { clips, stages } = loadTimingReport(file, "r1", LIMITS);
    expect(clips[0]).toMatchObject({ attempts: 1, generationSeconds: 300 });
    expect(stages.find((row) => row.stage === "image")).toMatchObject({ attempts: 3, timedOut: 1, slowestSuccessSeconds: 90 });
    expect(stages.find((row) => row.stage === "video")).toMatchObject({ attempts: 1, timedOut: 0 });
  });

  it("fails naming an unknown session id", () => {
    expect(() => loadTimingReport(file, "nope", LIMITS)).toThrow(/nope/);
  });
});
