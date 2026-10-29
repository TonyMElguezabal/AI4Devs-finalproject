import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SceneRow } from "../src/components/SceneRow";
import { formatClock, formatElapsed } from "../src/videoRequestFormat";
import type { SceneEventPayload, VideoRequestView } from "../src/types";

// show-video-request-status (JOS-200), task 3.1 — the clip request in flight, in the scene details.

const SENT_AT = "2026-10-27T12:04:10.000Z";
const BODY = { prompt: "Open on the calendar.", duration: 10, resolution: "2K", firstFrame: "scene 3 image" };

function request(overrides: Partial<VideoRequestView> = {}): VideoRequestView {
  return {
    provider: { name: "RunningHub", model: "minimax/hailuo-h3" },
    attempt: 1,
    sentAt: SENT_AT,
    estimate: { seconds: 500, basedOn: 3 },
    body: BODY,
    taskId: "task-abc",
    lastCheckedAt: null,
    waitEndsAt: new Date(Date.parse(SENT_AT) + 2400 * 1000).toISOString(),
    ...overrides,
  };
}

function generatingScene(videoRequest: VideoRequestView | undefined): SceneEventPayload {
  return {
    type: "scene",
    sessionId: "s1",
    sceneId: "scene-3",
    index: 3,
    state: "video-generating",
    stages: { video: { stage: "video", provider: { name: "RunningHub", model: "minimax/hailuo-h3" }, attempts: 1 } },
    instruction: "",
    ...(videoRequest ? { videoRequest } : {}),
    updatedAt: SENT_AT,
  };
}

async function renderExpanded(scene: SceneEventPayload) {
  render(<SceneRow scene={scene} onRetry={async () => {}} onCorrect={async () => {}} />);
  fireEvent.click(screen.getByRole("button", { name: "View scene 3 details" })); // synchronous: userEvent waits on timers the fake clock holds
}
const block = () => screen.getByRole("group", { name: "Scene 3 clip request" });
/** Moves the fake clock to `seconds` after the request was sent. */
const at = (seconds: number) => vi.setSystemTime(Date.parse(SENT_AT) + seconds * 1000);

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: false });
  at(210); // 3 min 30 s after the send
});
afterEach(() => vi.useRealTimers());

describe("the clip request block", () => {
  it("shows the provider, attempt, send time and the elapsed time while the clip generates", async () => {
    await renderExpanded(generatingScene(request({ attempt: 2 })));

    const view = within(block());
    expect(view.getByText(/RunningHub \(minimax\/hailuo-h3\), attempt 2/)).toBeTruthy();
    expect(view.getByText(formatClock(SENT_AT))).toBeTruthy();
    expect(view.getByText("3 min 30 s")).toBeTruthy();
  });

  it("keeps the elapsed time counting without a new snapshot", async () => {
    await renderExpanded(generatingScene(request()));
    expect(within(block()).getByText("3 min 30 s")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(5000); // advances the fake clock too: 215 s after the send
    });

    expect(within(block()).getByText("3 min 35 s")).toBeTruthy();
  });

  it("shows the expected arrival and how many clips the estimate is based on", async () => {
    await renderExpanded(generatingScene(request({ estimate: { seconds: 500, basedOn: 3 } })));

    const expected = formatClock(new Date(Date.parse(SENT_AT) + 500_000).toISOString());
    expect(within(block()).getByText(`Expected around ${expected}, based on 3 earlier clips`)).toBeTruthy();
  });

  it("says one earlier clip in the singular", async () => {
    await renderExpanded(generatingScene(request({ estimate: { seconds: 300, basedOn: 1 } })));

    expect(within(block()).getByText(/based on 1 earlier clip$/)).toBeTruthy();
  });

  it("shows no estimate yet when there is none", async () => {
    await renderExpanded(generatingScene(request({ estimate: null })));

    expect(within(block()).getByText("No estimate yet")).toBeTruthy();
  });

  it("says it is taking longer than estimated once the elapsed time passes the estimate, and keeps counting", async () => {
    at(520);
    await renderExpanded(generatingScene(request({ estimate: { seconds: 500, basedOn: 3 } })));

    expect(within(block()).getByText("Taking longer than estimated")).toBeTruthy();
    expect(within(block()).getByText("8 min 40 s")).toBeTruthy();
  });

  it("offers the request as sent, collapsed until the User opens it", async () => {
    await renderExpanded(generatingScene(request()));
    const toggle = within(block()).getByRole("button", { name: "Show the request sent for scene 3" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByLabelText("Scene 3 clip request JSON")).toBeNull();

    fireEvent.click(toggle);

    const json = screen.getByLabelText("Scene 3 clip request JSON");
    expect(JSON.parse(json.textContent ?? "")).toEqual(BODY);
    expect(within(block()).getByRole("button", { name: "Hide the request sent for scene 3" }).getAttribute("aria-expanded")).toBe("true");
  });

  it("is not shown when the scene has no request in flight", async () => {
    await renderExpanded({ ...generatingScene(undefined), state: "chunk-complete" });

    expect(screen.queryByRole("group", { name: "Scene 3 clip request" })).toBeNull();
  });
});

describe("the time formats", () => {
  it("writes the elapsed time in minutes and seconds, seconds alone under a minute", () => {
    expect(formatElapsed(0)).toBe("0 s");
    expect(formatElapsed(59)).toBe("59 s");
    expect(formatElapsed(60)).toBe("1 min 0 s");
    expect(formatElapsed(3725)).toBe("62 min 5 s");
  });

  it("never shows a negative elapsed time when the browser clock is behind the server's", () => {
    expect(formatElapsed(-4)).toBe("0 s");
  });
});

// show-clip-task-liveness (JOS-233), design Decision 5 — the task id, the last check and the wait's end, under the same block.
describe("the task and its last check", () => {
  const checkedSecondsAfterSend = (seconds: number) => new Date(Date.parse(SENT_AT) + seconds * 1000).toISOString();

  it("shows the provider's task id", async () => {
    await renderExpanded(generatingScene(request({ taskId: "task-abc" })));

    const view = within(block());
    expect(view.getByText("Task id")).toBeTruthy();
    expect(view.getByText("task-abc").tagName).toBe("CODE");
  });

  it("shows how long ago the task was last checked, counting on without a new snapshot", async () => {
    await renderExpanded(generatingScene(request({ lastCheckedAt: checkedSecondsAfterSend(200) }))); // the clock is at 210 s

    expect(within(block()).getByText("10 s ago")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(within(block()).getByText("15 s ago")).toBeTruthy();
  });

  it("says the task has not been checked yet when there is no last check", async () => {
    await renderExpanded(generatingScene(request({ lastCheckedAt: null })));

    expect(within(block()).getByText("Not checked yet")).toBeTruthy();
  });

  it("shows when the wait ends if the clip is unfinished", async () => {
    const waitEndsAt = checkedSecondsAfterSend(2400);
    await renderExpanded(generatingScene(request({ waitEndsAt })));

    const view = within(block());
    expect(view.getByText("Gives up at")).toBeTruthy();
    expect(view.getByText(`${formatClock(waitEndsAt)} if unfinished`)).toBeTruthy();
  });

  it("shows no end to the wait when the video stage has no time limit", async () => {
    await renderExpanded(generatingScene(request({ waitEndsAt: null })));

    expect(within(block()).queryByText("Gives up at")).toBeNull();
  });
});
