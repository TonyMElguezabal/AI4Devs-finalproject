import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetAdminPasswordReader, setAdminPasswordReader } from "../src/adminAccess.ts";
import { db, recordProviderChange, resetAll } from "../src/db.ts";
import { providerChangesReport } from "../src/providerChangesReport.ts";
import { buildApp } from "../src/server.ts";
import { registerScenes } from "./failedStageFixtures.ts";
import { PERIOD } from "./providerUsageFixtures.ts";

// record-provider-changes (JOS-229), group 4 — design Decision 4; JOS-229 AC3 and AC4.

const PASSWORD = "correct-horse-battery-staple";
const admin = { authorization: `Bearer ${PASSWORD}` };
const at = (day: number, hour = 10) => `2026-10-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:00:00.000Z`;

const change = (changedAt: string, overrides: Partial<Parameters<typeof recordProviderChange>[0]> = {}) =>
  recordProviderChange({
    changedAt,
    kind: "active-provider",
    stage: "voice",
    runId: null,
    sceneId: null,
    previousProviderId: "voice-a",
    previousProviderLabel: "Voice A",
    newProviderId: "voice-b",
    newProviderLabel: "Voice B",
    ...overrides,
  });

beforeEach(() => resetAll());
afterEach(() => resetAll());

describe("providerChangesReport", () => {
  it("returns the entries in [from, to) only, newest first, ties by id", () => {
    change(at(2));
    change(at(5));
    change(at(5)); // same instant as the previous: the later id comes first
    change("2026-09-30T23:59:59.999Z"); // before the period
    change(PERIOD.to); // `to` is excluded

    const report = providerChangesReport(PERIOD);

    expect(report.from).toBe(PERIOD.from);
    expect(report.to).toBe(PERIOD.to);
    expect(report.entries.map((entry) => entry.changedAt)).toEqual([at(5), at(5), at(2)]);
  });

  it("without a lower bound lists everything up to `to`", () => {
    change("2020-01-01T00:00:00.000Z");
    change(at(3));
    const report = providerChangesReport({ to: PERIOD.to });
    expect(report.from).toBeNull();
    expect(report.entries).toHaveLength(2);
  });

  it("shows a change without session or scene and a move with its session title and scene number (AC3)", async () => {
    const { runId, sceneIds } = await registerScenes([7, 8], "Lighthouse");
    change(at(2), { stage: "image", previousProviderId: "img-a", previousProviderLabel: "Img A", newProviderId: "img-b", newProviderLabel: "Img B" });
    change(at(3), { kind: "failed-stage-move", stage: "video", runId, sceneId: sceneIds[1]!, previousProviderId: "vid-a", previousProviderLabel: "Vid A", newProviderId: "vid-b", newProviderLabel: "Vid B" });
    change(at(4), { kind: "failed-stage-move", runId });

    expect(providerChangesReport(PERIOD).entries).toEqual([
      { changedAt: at(4), kind: "failed-stage-move", stage: "voice", sessionId: runId, sessionTitle: "Lighthouse", sceneNumber: null, previousProviderId: "voice-a", previousProviderLabel: "Voice A", newProviderId: "voice-b", newProviderLabel: "Voice B" },
      { changedAt: at(3), kind: "failed-stage-move", stage: "video", sessionId: runId, sessionTitle: "Lighthouse", sceneNumber: 2, previousProviderId: "vid-a", previousProviderLabel: "Vid A", newProviderId: "vid-b", newProviderLabel: "Vid B" },
      { changedAt: at(2), kind: "active-provider", stage: "image", sessionId: null, sessionTitle: null, sceneNumber: null, previousProviderId: "img-a", previousProviderLabel: "Img A", newProviderId: "img-b", newProviderLabel: "Img B" },
    ]);
  });

  it("is empty when nothing was logged", () => {
    expect(providerChangesReport(PERIOD).entries).toEqual([]);
  });
});

describe("GET /admin/reports/provider-changes", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    setAdminPasswordReader(() => PASSWORD);
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
    resetAdminPasswordReader();
  });

  const report = (query = "", headers: Record<string, string> = admin) => app.inject({ method: "GET", url: `/admin/reports/provider-changes${query}`, headers });
  const periodQuery = `?from=${PERIOD.from}&to=${PERIOD.to}`;

  it("is refused with 401 without the Administrator password and with a wrong one, returning no entry (AC4)", async () => {
    change(at(2), { newProviderLabel: "MARKER-LABEL" });
    for (const headers of [{} as Record<string, string>, { authorization: "Bearer wrong" }]) {
      const response = await report(periodQuery, headers);
      expect(response.statusCode).toBe(401);
      expect(response.body).not.toContain("MARKER-LABEL");
    }
  });

  it("answers 200 with the period and the entries", async () => {
    change(at(2));
    const response = await report(periodQuery);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      from: PERIOD.from,
      to: PERIOD.to,
      entries: [
        { changedAt: at(2), kind: "active-provider", stage: "voice", sessionId: null, sessionTitle: null, sceneNumber: null, previousProviderId: "voice-a", previousProviderLabel: "Voice A", newProviderId: "voice-b", newProviderLabel: "Voice B" },
      ],
    });
  });

  it("without a period reports all time up to now", async () => {
    change(at(2));
    const body = (await report()).json<{ from: string | null; to: string; entries: unknown[] }>();
    expect(body.from).toBeNull();
    expect(Date.parse(body.to)).toBeLessThanOrEqual(Date.now());
    expect(body.entries).toHaveLength(1);
  });

  it("answers 400 when from is not before to, or is not a date-time", async () => {
    for (const query of [`?from=${PERIOD.to}&to=${PERIOD.from}`, `?from=${PERIOD.from}&to=${PERIOD.from}`, "?from=yesterday"]) {
      expect((await report(query)).statusCode).toBe(400);
    }
  });

  it("holds no script and changes no table", async () => {
    const { runId } = await registerScenes([7]); // its script is "scene 1"
    change(at(2), { kind: "failed-stage-move", runId });
    const counts = () =>
      JSON.stringify(
        db.prepare("SELECT (SELECT COUNT(*) FROM runs) AS runs, (SELECT COUNT(*) FROM scenes) AS scenes, (SELECT COUNT(*) FROM provider_changes) AS changes, (SELECT COUNT(*) FROM active_providers) AS active").get(),
      );
    const before = counts();

    const response = await report(periodQuery);

    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain("scene 1");
    expect(counts()).toBe(before);
  });
});
