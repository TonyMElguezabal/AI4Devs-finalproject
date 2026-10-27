import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { API_BASE } from "../src/api/client";
import { ReportPeriodSelector } from "../src/components/ReportPeriodSelector";
import { ReportsSection } from "../src/components/ReportsSection";
import type { PipelineTimeReport, ProviderUsageReport, ProviderUsageRow, ReportPeriod } from "../src/types";

// report-provider-usage (JOS-223), group 4 — design Decision 7. `fetch` is mocked with the backend's answers.

const PASSWORD = "correct-horse-battery-staple";
const NOW = new Date("2026-10-22T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

const voiceRow: ProviderUsageRow = {
  stage: "voice",
  providerId: "voice-a",
  providerLabel: "Voice A",
  attempts: 5,
  successes: 2,
  transient: 1,
  notRetryable: 1,
  timedOut: 1,
  successRatePercent: 40,
  medianLatencyMs: 1000,
  p95LatencyMs: 60000,
  billedUnits: 12345,
  unit: "voice_characters",
};
const clipRow: ProviderUsageRow = {
  ...voiceRow,
  stage: "video",
  providerId: "vid-b",
  providerLabel: "Vid B",
  attempts: 2,
  successes: 1,
  transient: 0,
  timedOut: 0,
  successRatePercent: 50,
  medianLatencyMs: null,
  p95LatencyMs: null,
  billedUnits: 5,
  unit: "clip_seconds",
};

const reportOf = (rows: ProviderUsageRow[]): ProviderUsageReport => ({ from: null, to: NOW.toISOString(), sceneAttemptsFollowCurrentProvider: true, rows });

const emptyPipeline: PipelineTimeReport = {
  from: null,
  to: NOW.toISOString(),
  phases: (["voice-over", "decomposition", "scenes", "assembly"] as const).map((phase) => ({ phase, sessions: 0, medianSeconds: null, p95Seconds: null, timedOut: phase === "scenes" ? null : 0, finishedLate: phase === "scenes" ? null : 0, superseded: phase === "scenes" ? null : 0 })),
  sessions: [],
};

/** `answer` replies to the provider-usage request (its URLs are returned); the pipeline-time request gets `pipeline`. */
function stubBackend(answer: (url: URL) => Response, pipeline: () => Response = () => new Response(JSON.stringify(emptyPipeline), { status: 200 })) {
  const urls: URL[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const parsed = new URL(url);
      if (parsed.pathname.endsWith("/pipeline-time")) return pipeline();
      urls.push(parsed);
      return answer(parsed);
    }),
  );
  return urls;
}

const ok = (rows: ProviderUsageRow[]) => new Response(JSON.stringify(reportOf(rows)), { status: 200 });

beforeEach(() => vi.useFakeTimers({ toFake: ["Date"], now: NOW }));
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function Harness({ onPeriod }: { onPeriod: (period: ReportPeriod) => void }) {
  const [, setCount] = useState(0);
  return (
    <ReportPeriodSelector
      onChange={(period) => {
        onPeriod(period);
        setCount((count) => count + 1);
      }}
    />
  );
}

describe("ReportPeriodSelector", () => {
  it("has 'Last 30 days' selected by default", () => {
    render(<ReportPeriodSelector onChange={() => {}} />);
    expect(screen.getByRole("radio", { name: "Last 30 days" })).toBeChecked();
  });

  it("gives `from` seven or thirty days ago and no `to` for the presets", async () => {
    const onPeriod = vi.fn();
    render(<Harness onPeriod={onPeriod} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("radio", { name: "Last 7 days" }));
    expect(onPeriod).toHaveBeenLastCalledWith({ from: new Date(NOW.getTime() - 7 * DAY_MS).toISOString() });

    await user.click(screen.getByRole("radio", { name: "Last 30 days" }));
    expect(onPeriod).toHaveBeenLastCalledWith({ from: new Date(NOW.getTime() - 30 * DAY_MS).toISOString() });
  });

  it("gives neither bound for 'All time'", async () => {
    const onPeriod = vi.fn();
    render(<Harness onPeriod={onPeriod} />);
    await userEvent.setup().click(screen.getByRole("radio", { name: "All time" }));
    expect(onPeriod).toHaveBeenLastCalledWith({});
  });

  it("gives local midnight of the first day and of the day after the last day for a custom range", async () => {
    const onPeriod = vi.fn();
    render(<Harness onPeriod={onPeriod} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("radio", { name: "Custom range" }));
    await user.type(screen.getByLabelText("From date"), "2026-10-01");
    await user.type(screen.getByLabelText("To date"), "2026-10-03");

    expect(onPeriod).toHaveBeenLastCalledWith({ from: new Date(2026, 9, 1).toISOString(), to: new Date(2026, 9, 4).toISOString() });
  });
});

describe("ReportsSection", () => {
  it("requests the last 30 days on open and again when the period changes", async () => {
    const urls = stubBackend(() => ok([voiceRow]));
    render(<ReportsSection password={PASSWORD} onDenied={() => {}} />);

    await screen.findByRole("table", { name: "Provider usage" });
    expect(urls[0]!.pathname).toBe("/admin/reports/provider-usage");
    expect(urls[0]!.searchParams.get("from")).toBe(new Date(NOW.getTime() - 30 * DAY_MS).toISOString());
    expect(urls[0]!.searchParams.has("to")).toBe(false);

    await userEvent.setup().click(screen.getByRole("radio", { name: "Last 7 days" }));
    await waitFor(() => expect(urls).toHaveLength(2));
    expect(urls[1]!.searchParams.get("from")).toBe(new Date(NOW.getTime() - 7 * DAY_MS).toISOString());
  });

  it("sends the Administrator password", async () => {
    const seen: (string | null)[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        seen.push(new Headers(init?.headers).get("authorization"));
        return url.endsWith("/pipeline-time") || url.includes("/pipeline-time?") ? new Response(JSON.stringify(emptyPipeline), { status: 200 }) : ok([]);
      }),
    );
    render(<ReportsSection password={PASSWORD} onDenied={() => {}} />);
    await waitFor(() => expect(seen).toEqual([`Bearer ${PASSWORD}`, `Bearer ${PASSWORD}`]));
  });

  it("shows one table row per report row with formatted numbers and a dash for a missing latency", async () => {
    stubBackend(() => ok([voiceRow, clipRow]));
    render(<ReportsSection password={PASSWORD} onDenied={() => {}} />);

    const table = await screen.findByRole("table", { name: "Provider usage" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getAllByRole("cell").map((cell) => cell.textContent)).toEqual([
      "Voice",
      "Voice A",
      "5",
      "2",
      "1",
      "1",
      "1",
      "40%",
      "1,000 ms",
      "60,000 ms",
      "12,345 characters",
    ]);
    const clipCells = within(rows[1]!).getAllByRole("cell").map((cell) => cell.textContent);
    expect(clipCells.slice(8)).toEqual(["—", "—", "5 clip seconds"]);
  });

  it("has column headers a screen reader can use", async () => {
    stubBackend(() => ok([voiceRow]));
    render(<ReportsSection password={PASSWORD} onDenied={() => {}} />);
    const table = await screen.findByRole("table", { name: "Provider usage" });
    expect(within(table).getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
      "Stage",
      "Provider",
      "Attempts",
      "Successes",
      "Transient failures",
      "Not-retryable failures",
      "Timed out",
      "Success rate",
      "Median latency",
      "95th-percentile latency",
      "Billed units",
    ]);
  });

  it("shows the empty message when the period has no rows", async () => {
    stubBackend(() => ok([]));
    render(<ReportsSection password={PASSWORD} onDenied={() => {}} />);
    expect(await screen.findByText("No provider activity in this period.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("shows the attribution note when there is an image or video row, and not otherwise", async () => {
    stubBackend(() => ok([clipRow]));
    const { unmount } = render(<ReportsSection password={PASSWORD} onDenied={() => {}} />);
    expect(await screen.findByText(/image and clip attempts are counted for the scene's current provider/i)).toBeInTheDocument();
    unmount();

    stubBackend(() => ok([voiceRow]));
    render(<ReportsSection password={PASSWORD} onDenied={() => {}} />);
    await screen.findByRole("table", { name: "Provider usage" });
    expect(screen.queryByText(/image and clip attempts/i)).not.toBeInTheDocument();
  });

  it("locks the page when the request is answered 401", async () => {
    stubBackend(() => new Response("{}", { status: 401 }));
    const onDenied = vi.fn();
    render(<ReportsSection password={PASSWORD} onDenied={onDenied} />);
    await waitFor(() => expect(onDenied).toHaveBeenCalledTimes(1));
  });

  it("says the report could not be loaded when the request fails", async () => {
    stubBackend(() => new Response("{}", { status: 500 }));
    render(<ReportsSection password={PASSWORD} onDenied={() => {}} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load the provider usage report");
  });

  // fix-frontend-lint-errors (JOS-231): the errors are cleared when another period is chosen, not at the start of the effect.
  it("clears both load errors as soon as another period is chosen", async () => {
    let usageCalls = 0;
    let pipelineCalls = 0;
    stubBackend(
      () => (usageCalls++ === 0 ? new Response("{}", { status: 500 }) : ok([voiceRow])),
      () => (pipelineCalls++ === 0 ? new Response("{}", { status: 500 }) : new Response(JSON.stringify(emptyPipeline), { status: 200 })),
    );
    render(<ReportsSection password={PASSWORD} onDenied={() => {}} />);
    expect(await screen.findByText(/Could not load the provider usage report/)).toBeInTheDocument();
    expect(await screen.findByText(/Could not load the pipeline time report/)).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole("radio", { name: "Last 7 days" }));

    await waitFor(() => expect(screen.queryByText(/Could not load the provider usage report/)).not.toBeInTheDocument());
    expect(screen.queryByText(/Could not load the pipeline time report/)).not.toBeInTheDocument();
    expect(await screen.findByRole("table", { name: "Provider usage" })).toBeInTheDocument();
  });
});

// record-phase-instants-and-pipeline-report (JOS-228), group 5.
const pipelineReport: PipelineTimeReport = {
  ...emptyPipeline,
  phases: [
    { phase: "voice-over", sessions: 2, medianSeconds: 20, p95Seconds: 1234.5, timedOut: 1, finishedLate: 2, superseded: 3 },
    { phase: "decomposition", sessions: 0, medianSeconds: null, p95Seconds: null, timedOut: 0, finishedLate: 0, superseded: 0 },
    { phase: "scenes", sessions: 1, medianSeconds: 90, p95Seconds: 90, timedOut: null, finishedLate: null, superseded: null },
    { phase: "assembly", sessions: 0, medianSeconds: null, p95Seconds: null, timedOut: 0, finishedLate: 0, superseded: 0 },
  ],
  sessions: [
    { runId: "r1", title: "Lighthouse", seconds: { "voice-over": 20, decomposition: null, scenes: 90, assembly: null } },
  ],
};

describe("ReportsSection pipeline time", () => {
  const withPipeline = (pipeline: () => Response) => stubBackend(() => ok([voiceRow]), pipeline);

  it("requests the pipeline-time report for the same period", async () => {
    const seen: URL[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const parsed = new URL(url);
        seen.push(parsed);
        return new Response(JSON.stringify(parsed.pathname.endsWith("/pipeline-time") ? pipelineReport : reportOf([])), { status: 200 });
      }),
    );
    render(<ReportsSection password={PASSWORD} onDenied={() => {}} />);
    await screen.findByRole("table", { name: "Pipeline time" });
    const request = seen.find((url) => url.pathname === "/admin/reports/pipeline-time")!;
    expect(request.searchParams.get("from")).toBe(new Date(NOW.getTime() - 30 * DAY_MS).toISOString());
  });

  it("shows seconds per phase, a dash for no time and 'not recorded' for the scenes counts", async () => {
    withPipeline(() => new Response(JSON.stringify(pipelineReport), { status: 200 }));
    render(<ReportsSection password={PASSWORD} onDenied={() => {}} />);

    const table = await screen.findByRole("table", { name: "Pipeline time" });
    const rows = within(table).getAllByRole("row").slice(1);
    const cells = (index: number) => within(rows[index]!).getAllByRole("cell").map((cell) => cell.textContent);
    expect(cells(0)).toEqual(["Voice-over", "2", "20 s", "1,234.5 s", "1", "2", "3"]);
    expect(cells(1)).toEqual(["Decomposition", "0", "—", "—", "0", "0", "0"]);
    expect(cells(2)).toEqual(["Scenes", "1", "90 s", "90 s", "not recorded", "not recorded", "not recorded"]);
  });

  it("lists each session with a dash for a phase that has no time", async () => {
    withPipeline(() => new Response(JSON.stringify(pipelineReport), { status: 200 }));
    render(<ReportsSection password={PASSWORD} onDenied={() => {}} />);

    const table = await screen.findByRole("table", { name: "Pipeline time per session" });
    const cells = within(within(table).getAllByRole("row")[1]!).getAllByRole("cell").map((cell) => cell.textContent);
    expect(cells).toEqual(["Lighthouse", "20 s", "—", "90 s", "—"]);
  });

  it("says there is no pipeline activity when no session has a phase in the period", async () => {
    withPipeline(() => new Response(JSON.stringify(emptyPipeline), { status: 200 }));
    render(<ReportsSection password={PASSWORD} onDenied={() => {}} />);
    expect(await screen.findByText("No pipeline activity in this period.")).toBeInTheDocument();
  });

  it("locks the page, once, when the pipeline-time request is answered 401", async () => {
    stubBackend(() => new Response("{}", { status: 401 }), () => new Response("{}", { status: 401 }));
    const onDenied = vi.fn();
    render(<ReportsSection password={PASSWORD} onDenied={onDenied} />);
    await waitFor(() => expect(onDenied).toHaveBeenCalled());
    expect(onDenied).toHaveBeenCalledTimes(1);
  });

  it("says the pipeline time report could not be loaded when only that request fails", async () => {
    withPipeline(() => new Response("{}", { status: 500 }));
    render(<ReportsSection password={PASSWORD} onDenied={() => {}} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load the pipeline time report");
    expect(await screen.findByRole("table", { name: "Provider usage" })).toBeInTheDocument();
  });
});
