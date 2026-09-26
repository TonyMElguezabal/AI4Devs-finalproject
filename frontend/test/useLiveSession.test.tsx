import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLiveSession } from "../src/api/useLiveSession";
import * as client from "../src/api/client";
import type { SessionSnapshot } from "../src/types";

// A controllable fake EventSource — define-live-updates (JOS-183) Decision 3
// puts the transport behind this one seam, so the hook is testable without a
// real network connection.
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  closed = false;

  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }

  emitOpen() {
    this.onopen?.();
  }
  emitMessage(snapshot: SessionSnapshot) {
    this.onmessage?.({ data: JSON.stringify(snapshot) });
  }
  close() {
    this.closed = true;
  }
}

function snapshot(overrides: Partial<SessionSnapshot["session"]> = {}, scenes: SessionSnapshot["scenes"] = []): SessionSnapshot {
  return {
    session: {
      type: "session",
      sessionId: "s1",
      title: "t",
      script: "s",
      language: "en",
      state: "chunks-processing",
      paused: false,
      updatedAt: "2026-09-25T00:00:00.000Z",
      ...overrides,
    },
    scenes,
  };
}

function scene(sceneId: string, state: string, updatedAt = "2026-09-25T00:00:00.000Z") {
  return {
    type: "scene" as const,
    sessionId: "s1",
    sceneId,
    index: 1,
    state: state as SessionSnapshot["scenes"][number]["state"],
    updatedAt,
  };
}

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource as unknown as typeof EventSource);
  vi.spyOn(client, "fetchSnapshot").mockResolvedValue(snapshot());
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// define-live-updates Decision 2 — task 8.2.
describe("applying the same event twice (Decision 2)", () => {
  it("leaves the held state unchanged", async () => {
    const { result } = renderHook(() => useLiveSession("s1"));
    const source = FakeEventSource.instances[0]!;
    act(() => source.emitOpen());
    await waitFor(() => expect(result.current.snapshot).toBeDefined());

    const payload = snapshot({ state: "final-video" }, [scene("a", "chunk-complete")]);
    act(() => source.emitMessage(payload));
    const afterFirst = result.current.snapshot;

    act(() => source.emitMessage(payload)); // the exact same event again
    const afterSecond = result.current.snapshot;

    expect(afterSecond).toEqual(afterFirst);
  });
});

// task 8.3 — coalescing: latest state per scene, distinct scenes never merged.
describe("collapsed events per scene (Decision 6)", () => {
  it("keeps each scene's latest state, and never merges distinct scenes", async () => {
    const { result } = renderHook(() => useLiveSession("s1"));
    const source = FakeEventSource.instances[0]!;
    act(() => source.emitOpen());
    await waitFor(() => expect(result.current.snapshot).toBeDefined());

    act(() => source.emitMessage(snapshot({}, [scene("a", "image-generating"), scene("b", "submitted")])));
    act(() => source.emitMessage(snapshot({}, [scene("a", "chunk-complete"), scene("b", "image-generating")])));

    const scenes = result.current.snapshot!.scenes;
    expect(scenes.find((s) => s.sceneId === "a")!.state).toBe("chunk-complete");
    expect(scenes.find((s) => s.sceneId === "b")!.state).toBe("image-generating"); // not overwritten by scene a's update
  });
});

// task 8.4 — paused marker separate from session state (§8.1, Decision 8).
describe("paused marker (Decision 8)", () => {
  it("is carried separately, and continuing leaves the session state unchanged", async () => {
    const { result } = renderHook(() => useLiveSession("s1"));
    const source = FakeEventSource.instances[0]!;
    act(() => source.emitOpen());
    await waitFor(() => expect(result.current.snapshot).toBeDefined());

    act(() => source.emitMessage(snapshot({ state: "chunks-processing", paused: true })));
    expect(result.current.snapshot!.session.state).toBe("chunks-processing");
    expect(result.current.snapshot!.session.paused).toBe(true);

    act(() => source.emitMessage(snapshot({ state: "chunks-processing", paused: false })));
    expect(result.current.snapshot!.session.state).toBe("chunks-processing"); // unchanged by continuing
    expect(result.current.snapshot!.session.paused).toBe(false);
  });
});

// task 8.5 — reconnection applies the catch-up rule (resync, not replay).
describe("reconnection resync (Decision 3/4)", () => {
  it("re-fetches the full snapshot on every open, including reconnects", async () => {
    renderHook(() => useLiveSession("s1"));
    const source = FakeEventSource.instances[0]!;

    act(() => source.emitOpen()); // first connect
    await waitFor(() => expect(client.fetchSnapshot).toHaveBeenCalledTimes(1));

    act(() => source.emitOpen()); // simulated automatic reconnect after a drop
    await waitFor(() => expect(client.fetchSnapshot).toHaveBeenCalledTimes(2));
  });
});
