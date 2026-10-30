import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SessionsReport } from "../src/components/SessionsReport";
import type { ReportPeriod, SessionScenesReport, SessionsReport as SessionsReportData, SessionReportRow } from "../src/types";

// report-sessions (JOS-225), group 4 — design Decision 7. `fetch` is mocked with the backend's answers.

const PASSWORD = "correct-horse-battery-staple";
const PERIOD: ReportPeriod = { from: "2026-10-01T00:00:00.000Z" };
const CREATED = "2026-10-05T10:00:00.000Z";
const createdText = (iso: string) => new Date(iso).toLocaleString("en", { dateStyle: "medium", timeStyle: "short" });

const ready: SessionReportRow = {
  id: "s-ready",
  title: "Lighthouse",
  createdAt: CREATED,
  state: "final-video-ready",
  failedPhase: null,
  paused: false,
  scenes: 2,
  failedScenes: 0,
  attempts: 15,
  secondsToVoiceOver: 0.1,
  secondsToFinalVideo: 18.1,
  estimatedCost: [],
  excludesUnpricedProvider: false,
};
const failed: SessionReportRow = { ...ready, id: "s-failed", title: "Harbour", state: "failed", failedPhase: "assembly", paused: true, scenes: 0, attempts: 1234, secondsToVoiceOver: null, secondsToFinalVideo: null };
const running: SessionReportRow = { ...ready, id: "s-running", title: "Cliffs", state: "in-progress", secondsToFinalVideo: null };

const listOf = (rows: SessionReportRow[]): SessionsReportData => ({ from: PERIOD.from ?? null, to: "2026-10-22T12:00:00.000Z", rows });

const scenesOf = (sessionId: string): SessionScenesReport => ({
  sessionId,
  rows: [
    { number: 1, status: "chunk-complete", imageProvider: "Image A", clipProvider: "Clip B", imageAttempts: 2, clipAttempts: 1, requestedDurationSeconds: 7, speedFactor: 1.5, durationWarning: "exceeds-maximum", speedFactorWarning: "exceeds-limit" },
    { number: 3, status: "chunk-complete", imageProvider: "Image A", clipProvider: "Clip B", imageAttempts: 1, clipAttempts: 1, requestedDurationSeconds: 12, speedFactor: 1.0183299389002036, durationWarning: null, speedFactorWarning: null },
    { number: 2, status: "submitted", imageProvider: null, clipProvider: null, imageAttempts: 0, clipAttempts: 0, requestedDurationSeconds: null, speedFactor: null, durationWarning: null, speedFactorWarning: null },
  ],
});

function stub(answer: (url: URL) => Response): URL[] {
  const urls: URL[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const parsed = new URL(url);
      urls.push(parsed);
      return answer(parsed);
    }),
  );
  return urls;
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

afterEach(() => vi.unstubAllGlobals());

const renderReport = (period: ReportPeriod = PERIOD, onDenied = () => {}) => render(<SessionsReport password={PASSWORD} period={period} onDenied={onDenied} />);

describe("SessionsReport", () => {
  it("requests the list for the selected period and again when it changes", async () => {
    const urls = stub(() => json(listOf([ready])));
    const { rerender } = renderReport();

    await screen.findByRole("table", { name: "Sessions" });
    expect(urls[0]!.pathname).toBe("/admin/reports/sessions");
    expect(urls[0]!.searchParams.get("from")).toBe(PERIOD.from);

    rerender(<SessionsReport password={PASSWORD} period={{}} onDenied={() => {}} />);
    await waitFor(() => expect(urls).toHaveLength(2));
    expect(urls[1]!.searchParams.has("from")).toBe(false);
  });

  it("sends the Administrator password", async () => {
    const seen: (string | null)[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        seen.push(new Headers(init?.headers).get("authorization"));
        return json(listOf([]));
      }),
    );
    renderReport();
    await waitFor(() => expect(seen).toEqual([`Bearer ${PASSWORD}`]));
  });

  it("shows one row per session with readable state, paused flag, counts and a dash for a missing time", async () => {
    stub(() => json(listOf([ready, failed, running])));
    renderReport();

    const table = await screen.findByRole("table", { name: "Sessions" });
    const rows = within(table).getAllByRole("row").slice(1);
    const cells = (index: number) => within(rows[index]!).getAllByRole("cell").map((cell) => cell.textContent);
    expect(cells(0)).toEqual(["Lighthouse", createdText(CREATED), "Final video ready", "—", "2", "0", "15", "0.1 s", "18.1 s", "—", "Scenes"]);
    expect(cells(1)).toEqual(["Harbour", createdText(CREATED), "Failed in assembly", "Paused", "0", "0", "1,234", "—", "—", "—", "Scenes"]);
    expect(cells(2)[2]).toBe("In progress");
  });

  it("has a caption and column headers a screen reader can use", async () => {
    stub(() => json(listOf([ready])));
    renderReport();
    const table = await screen.findByRole("table", { name: "Sessions" });
    expect(within(table).getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
      "Session",
      "Created",
      "State",
      "Paused",
      "Scenes",
      "Failed scenes",
      "Attempts",
      "Seconds to voice-over",
      "Seconds to final video",
      "Estimated cost",
      "Details",
    ]);
  });

  it("says there are no sessions when the period has none", async () => {
    stub(() => json(listOf([])));
    renderReport();
    expect(await screen.findByText("No sessions were created in this period.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("locks the page when the request is answered 401", async () => {
    stub(() => json({}, 401));
    const onDenied = vi.fn();
    renderReport(PERIOD, onDenied);
    await waitFor(() => expect(onDenied).toHaveBeenCalledTimes(1));
  });

  it("says the report could not be loaded when the request fails, and the message goes when the period changes", async () => {
    let calls = 0;
    stub(() => (calls++ === 0 ? json({}, 500) : json(listOf([ready]))));
    const { rerender } = renderReport();
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load the sessions report");

    rerender(<SessionsReport password={PASSWORD} period={{}} onDenied={() => {}} />);

    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(await screen.findByRole("table", { name: "Sessions" })).toBeInTheDocument();
  });
});

describe("SessionsReport scene drill-down", () => {
  const answerBoth = (url: URL) => (url.pathname.endsWith("/scenes") ? json(scenesOf(url.pathname.split("/")[4]!)) : json(listOf([ready, failed])));

  it("opens and closes the scenes of a session, loading them once when first opened", async () => {
    const urls = stub(answerBoth);
    renderReport();
    const button = await screen.findByRole("button", { name: "Scenes of Lighthouse" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    const user = userEvent.setup();

    await user.click(button);
    const scenes = await screen.findByRole("table", { name: "Scenes of Lighthouse" });
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(urls.filter((url) => url.pathname === "/admin/reports/sessions/s-ready/scenes")).toHaveLength(1);

    const rows = within(scenes).getAllByRole("row").slice(1);
    const cells = (index: number) => within(rows[index]!).getAllByRole("cell").map((cell) => cell.textContent);
    expect(cells(0)).toEqual(["1", "chunk-complete", "Image A", "Clip B", "2", "1", "7 s", "1.5×", "exceeds maximum", "exceeds limit"]);
    expect(cells(1)).toEqual(["3", "chunk-complete", "Image A", "Clip B", "1", "1", "12 s", "1.02×", "—", "—"]);
    expect(cells(2)).toEqual(["2", "submitted", "—", "—", "0", "0", "—", "—", "—", "—"]);

    await user.click(button);
    expect(screen.queryByRole("table", { name: "Scenes of Lighthouse" })).not.toBeInTheDocument();
    expect(button).toHaveAttribute("aria-expanded", "false");

    await user.click(button);
    expect(await screen.findByRole("table", { name: "Scenes of Lighthouse" })).toBeInTheDocument();
    expect(urls.filter((url) => url.pathname.endsWith("/scenes"))).toHaveLength(1);
  });

  it("has column headers for the scene table", async () => {
    stub(answerBoth);
    renderReport();
    await userEvent.setup().click(await screen.findByRole("button", { name: "Scenes of Lighthouse" }));
    const scenes = await screen.findByRole("table", { name: "Scenes of Lighthouse" });
    expect(within(scenes).getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
      "Scene",
      "Status",
      "Image provider",
      "Clip provider",
      "Image requests",
      "Clip requests",
      "Requested duration",
      "Speed factor",
      "Duration warning",
      "Speed-factor warning",
    ]);
  });

  it("says a session without scenes has none", async () => {
    stub((url) => (url.pathname.endsWith("/scenes") ? json({ sessionId: "s-failed", rows: [] }) : json(listOf([failed]))));
    renderReport();
    await userEvent.setup().click(await screen.findByRole("button", { name: "Scenes of Harbour" }));
    expect(await screen.findByText("This session has no scenes.")).toBeInTheDocument();
  });

  it("locks the page when the scenes request is answered 401", async () => {
    stub((url) => (url.pathname.endsWith("/scenes") ? json({}, 401) : json(listOf([ready]))));
    const onDenied = vi.fn();
    renderReport(PERIOD, onDenied);
    await userEvent.setup().click(await screen.findByRole("button", { name: "Scenes of Lighthouse" }));
    await waitFor(() => expect(onDenied).toHaveBeenCalledTimes(1));
  });

  it("says the scenes could not be loaded when that request fails, and tries again the next time it is opened", async () => {
    let scenesCalls = 0;
    stub((url) => (url.pathname.endsWith("/scenes") ? (scenesCalls++ === 0 ? json({}, 500) : json(scenesOf("s-ready"))) : json(listOf([ready]))));
    renderReport();
    const user = userEvent.setup();
    const button = await screen.findByRole("button", { name: "Scenes of Lighthouse" });

    await user.click(button);
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load the scenes");

    await user.click(button);
    await user.click(button);
    expect(await screen.findByRole("table", { name: "Scenes of Lighthouse" })).toBeInTheDocument();
  });
});

// report-estimated-cost (JOS-227), task 6.1 — design Decisions 5 and 6.
describe("SessionsReport estimated cost", () => {
  it("shows each session's cost per currency, labelled an estimate, with a note for an unpriced provider and a dash for no amount", async () => {
    const priced: SessionReportRow = { ...ready, estimatedCost: [{ currency: "EUR", estimatedCost: 1.7 }, { currency: "USD", estimatedCost: 0.25 }], excludesUnpricedProvider: true };
    stub(() => json(listOf([priced, failed])));
    renderReport();

    const table = await screen.findByRole("table", { name: "Sessions" });
    expect(within(table).getByRole("columnheader", { name: "Estimated cost" })).toBeInTheDocument();
    const cell = within(table).getByRole("cell", { name: "Estimated cost of Lighthouse: EUR 1.70, USD 0.25 (estimate, excludes unpriced providers)" });
    expect(cell).toHaveTextContent("EUR 1.70, USD 0.25 (excludes unpriced providers)");
    expect(within(table).getByRole("cell", { name: "Estimated cost of Harbour: none" })).toHaveTextContent("—");
  });
});
