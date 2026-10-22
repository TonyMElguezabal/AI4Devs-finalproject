import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { API_BASE } from "../src/api/client";
import { FailedStagesSection } from "../src/components/FailedStagesSection";
import type { FailedStageRow } from "../src/types";

// move-failed-stage-to-active-provider (JOS-172), group 7 — design Decision 7. `fetch` is mocked with the backend's answers.

const PASSWORD = "correct-horse-battery-staple";

const voiceRow: FailedStageRow = {
  sessionId: "S1",
  sessionTitle: "Harbor",
  stage: "voice",
  sceneId: null,
  sceneNumber: null,
  boundProviderId: "stub-a",
  boundProviderLabel: "Stub A",
  activeProviderId: "stub-b",
  activeProviderLabel: "Stub B",
  cause: "the voice provider answered HTTP 503",
};
const clipRow: FailedStageRow = { ...voiceRow, sessionId: "S2", sessionTitle: "Lighthouse", stage: "video", sceneId: "SC2", sceneNumber: 2, cause: "the video provider answered HTTP 503" };

type Call = { url: string; method: string; body?: unknown; authorization: string | null };

function stubBackend(options: { rows?: FailedStageRow[]; move?: (call: Call) => Response } = {}) {
  const calls: Call[] = [];
  let rows = options.rows ?? [voiceRow, clipRow];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const call: Call = { url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined, authorization: new Headers(init?.headers).get("authorization") };
      calls.push(call);
      if (url === `${API_BASE}/admin/failed-stages` && method === "GET") return new Response(JSON.stringify({ failedStages: rows }), { status: 200 });
      if (url === `${API_BASE}/admin/failed-stages/to-active-provider` && method === "POST") {
        const response = options.move ? options.move(call) : new Response("{}", { status: 200 });
        if (response.ok) rows = rows.filter((row) => !(row.sessionId === (call.body as { sessionId: string }).sessionId));
        return response;
      }
      return new Response("{}", { status: 404 });
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

const renderSection = (props: Partial<Parameters<typeof FailedStagesSection>[0]> = {}) =>
  render(<FailedStagesSection password={PASSWORD} onDenied={() => undefined} {...props} />);

describe("FailedStagesSection", () => {
  it("lists each failed stage with the session, the stage and scene, both providers, the cause and a move button", async () => {
    const calls = stubBackend();
    renderSection();

    const region = await screen.findByRole("region", { name: "Failed stages" });
    const voice = within(region).getByRole("listitem", { name: "Voice of Harbor" });
    expect(voice).toHaveTextContent("bound to Stub A");
    expect(voice).toHaveTextContent("active provider Stub B");
    expect(voice).toHaveTextContent("the voice provider answered HTTP 503");
    const clip = within(region).getByRole("listitem", { name: "Video of Lighthouse, scene 2" });
    expect(clip).toHaveTextContent("scene 2");
    expect(within(voice).getByRole("button", { name: "Move voice of Harbor to Stub B" })).toBeInTheDocument();
    expect(within(clip).getByRole("button", { name: "Move video of Lighthouse, scene 2 to Stub B" })).toBeInTheDocument();
    expect(calls.every((call) => call.authorization === `Bearer ${PASSWORD}`)).toBe(true);
  });

  it("says so when no failed stage is on another provider", async () => {
    stubBackend({ rows: [] });
    renderSection();
    expect(await screen.findByText("No failed stage is on a provider other than the active one.")).toBeInTheDocument();
  });

  it("sends the move with the session, stage and scene, says how to retry, links to the session and reloads the list", async () => {
    const onChanged = vi.fn();
    const calls = stubBackend({ move: () => new Response(JSON.stringify({ moved: {} }), { status: 200 }) });
    const user = userEvent.setup();
    renderSection({ onChanged });

    await user.click(await screen.findByRole("button", { name: "Move video of Lighthouse, scene 2 to Stub B" }));

    const post = calls.find((call) => call.method === "POST")!;
    expect(post.body).toEqual({ sessionId: "S2", stage: "video", sceneId: "SC2" });
    expect(await screen.findByRole("status")).toHaveTextContent("Moved. Retry it from the session page.");
    expect(screen.getByRole("link", { name: "Open session Lighthouse" })).toHaveAttribute("href", "/?sessionId=S2");
    await waitFor(() => expect(screen.queryByRole("button", { name: "Move video of Lighthouse, scene 2 to Stub B" })).toBeNull());
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(calls.filter((call) => call.method === "GET").length).toBe(2);
  });

  it("sends a session stage without a scene id", async () => {
    const calls = stubBackend();
    const user = userEvent.setup();
    renderSection();
    await user.click(await screen.findByRole("button", { name: "Move voice of Harbor to Stub B" }));
    expect(calls.find((call) => call.method === "POST")!.body).toEqual({ sessionId: "S1", stage: "voice" });
  });

  it.each([
    ["not-failed", /no longer failed/i],
    ["already-on-active", /already on the active provider/i],
    ["retry-in-progress", /retry of this stage is in progress/i],
    ["not-retryable", /cannot be retried/i],
    ["not-usable", /no usable API key/i],
  ])("shows the %s refusal in words and reloads the list", async (reason, text) => {
    const calls = stubBackend({ move: () => new Response(JSON.stringify({ ok: false, reason }), { status: 409 }) });
    const user = userEvent.setup();
    renderSection();

    await user.click(await screen.findByRole("button", { name: "Move voice of Harbor to Stub B" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(text);
    expect(calls.filter((call) => call.method === "GET").length).toBe(2);
  });

  it("locks the page again when a request is refused with 401", async () => {
    const onDenied = vi.fn();
    stubBackend({ move: () => new Response(JSON.stringify({ ok: false, reason: "wrong-password" }), { status: 401 }) });
    const user = userEvent.setup();
    renderSection({ onDenied });
    await user.click(await screen.findByRole("button", { name: "Move voice of Harbor to Stub B" }));
    await waitFor(() => expect(onDenied).toHaveBeenCalledTimes(1));
  });

  it("reloads when refreshKey changes", async () => {
    const calls = stubBackend();
    const { rerender } = renderSection({ refreshKey: 0 });
    await screen.findByRole("region", { name: "Failed stages" });
    rerender(<FailedStagesSection password={PASSWORD} onDenied={() => undefined} refreshKey={1} />);
    await waitFor(() => expect(calls.filter((call) => call.method === "GET").length).toBe(2));
  });
});
