import { useEffect, useRef, useState } from "react";
import { eventsUrl, fetchSnapshot } from "./client";
import type { SessionSnapshot } from "../types";

/**
 * Observation instrumentation for `define-live-updates` (JOS-183) task 6.5:
 * "so assertions rest on observation rather than on inspection by eye."
 * Exposed on `window` so the burst/disconnect/restart/idle experiments can
 * query what the page actually received, via a debugger/automation tool,
 * instead of eyeballing a screenshot. Debug-only; harmless in the prototype.
 */
export interface LiveUpdatesLogEntry {
  receivedAt: number;
  sessionState: string;
  paused: boolean;
  sceneCount: number;
  sceneStates: Record<string, string>; // sceneId -> state, at the moment this message arrived
}

declare global {
  interface Window {
    __liveUpdatesLog__?: LiveUpdatesLogEntry[];
    __liveUpdatesConnectCount__?: number;
  }
}

function record(snapshot: SessionSnapshot): void {
  if (typeof window === "undefined") return;
  window.__liveUpdatesLog__ ??= [];
  window.__liveUpdatesLog__.push({
    receivedAt: Date.now(),
    sessionState: snapshot.session.state,
    paused: snapshot.session.paused,
    sceneCount: snapshot.scenes.length,
    sceneStates: Object.fromEntries(snapshot.scenes.map((s) => [s.sceneId, s.state])),
  });
}

/**
 * The Decision 3 seam (design.md): every view consumes live state through
 * this one hook. Swapping the transport `define-live-updates` eventually
 * ships with a different mechanism means changing this file only — no view
 * ever touches `EventSource` directly.
 *
 * Implements the catch-up rule from `define-live-updates` Decision 3/4:
 * resync, not replay. `onopen` fires on the first connect AND on every
 * automatic browser reconnect after a drop; re-fetching the full snapshot
 * there (not just once on mount) is what makes the page correct after a
 * dropped connection or a backend restart, since the stream itself carries
 * no backlog. This exact gap was found and fixed in the JOS-179/183 skeleton
 * page — see `docs/adr/0001-backend-stack.md` § Evidence.
 */
export function useLiveSession(sessionId: string | undefined): {
  snapshot: SessionSnapshot | undefined;
  connected: boolean;
  error: string | undefined;
} {
  const [snapshot, setSnapshot] = useState<SessionSnapshot | undefined>(undefined);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const sourceRef = useRef<EventSource | undefined>(undefined);

  useEffect(() => {
    if (!sessionId) return;
    setSnapshot(undefined);
    setConnected(false);
    setError(undefined);
    if (typeof window !== "undefined") {
      window.__liveUpdatesLog__ = [];
      window.__liveUpdatesConnectCount__ = 0;
    }

    const source = new EventSource(eventsUrl(sessionId));
    sourceRef.current = source;

    source.onopen = () => {
      setConnected(true);
      if (typeof window !== "undefined") {
        window.__liveUpdatesConnectCount__ = (window.__liveUpdatesConnectCount__ ?? 0) + 1;
      }
      fetchSnapshot(sessionId)
        .then((snap) => {
          setSnapshot(snap);
          record(snap);
        })
        .catch((err) => setError(String(err)));
    };
    source.onerror = () => setConnected(false);
    source.onmessage = (event) => {
      const snap = JSON.parse(event.data) as SessionSnapshot;
      setSnapshot(snap);
      record(snap);
    };

    return () => {
      source.close();
      sourceRef.current = undefined;
    };
  }, [sessionId]);

  return { snapshot, connected, error };
}
