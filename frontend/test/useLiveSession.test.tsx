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
  // Mirrors real EventSource's readyState constants, needed so the hook's
  // `source.readyState === EventSource.CLOSED` check (consult-session,
  // JOS-135, task 4.4) is exercisable under this fake.
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;

  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  closed = false;
  readyState = FakeEventSource.CONNECTING;

  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }

  emitOpen() {
    this.readyState = FakeEventSource.OPEN;
    this.onopen?.();
  }
  emitMessage(snapshot: SessionSnapshot) {
    this.onmessage?.({ data: JSON.stringify(snapshot) });
  }
  /** Simulates the backend's /events route rejecting an unknown session
   * with 404 before upgrading — a permanent failure, never a retry. */
  emitPermanentError() {
    this.readyState = FakeEventSource.CLOSED;
    this.onerror?.();
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
      held: [],
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

// consult-session (JOS-135) task 4.4 — the "not found" state, distinguished
// from every other case: never called before, never opened, and the
// permanent-failure shape a 404 produces.
describe("an unknown session identifier (Decision 4)", () => {
  it("reports notFound when the stream fails permanently without ever opening", async () => {
    const { result } = renderHook(() => useLiveSession("does-not-exist"));
    const source = FakeEventSource.instances[0]!;
    expect(result.current.notFound).toBe(false);

    act(() => source.emitPermanentError());
    await waitFor(() => expect(result.current.notFound).toBe(true));
    expect(result.current.snapshot).toBeUndefined();
  });

  it("does not report notFound for an ordinary drop after a previous successful connection", async () => {
    const { result } = renderHook(() => useLiveSession("s1"));
    const source = FakeEventSource.instances[0]!;
    act(() => source.emitOpen());
    await waitFor(() => expect(result.current.snapshot).toBeDefined());

    // A later transient error — the browser would normally retry this one,
    // not the permanent-failure case above.
    source.readyState = FakeEventSource.CONNECTING;
    act(() => source.onerror?.());
    expect(result.current.notFound).toBe(false);
  });
});

// JOS-152 task 8.3 — a held change in a live event re-renders without reload
describe("held field live update (JOS-152, task 8.3)", () => {
  it("a held change in a live event re-renders without reload", async () => {
    const { result } = renderHook(() => useLiveSession("s1"));
    const source = FakeEventSource.instances[0]!;
    act(() => source.emitOpen());
    await waitFor(() => expect(result.current.snapshot).toBeDefined());

    act(() => source.emitMessage(snapshot({ held: [{ stage: "image", count: 2 }], paused: true })));
    expect(result.current.snapshot!.session.held).toEqual([{ stage: "image", count: 2 }]);
    expect(result.current.snapshot!.session.paused).toBe(true);

    act(() => source.emitMessage(snapshot({ held: [], paused: false })));
    expect(result.current.snapshot!.session.held).toEqual([]);
    expect(result.current.snapshot!.session.paused).toBe(false);
  });
});
