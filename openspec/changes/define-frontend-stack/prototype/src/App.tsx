import { useCallback, useState } from "react";
import { StartProjectForm, type StartProjectValues } from "./components/StartProjectForm";
import { SessionHeader } from "./components/SessionHeader";
import { SceneList } from "./components/SceneList";
import { FinalVideoDownload } from "./components/FinalVideoDownload";
import { useLiveSession } from "./api/useLiveSession";
import { correctScene, createSession, continueSession, downloadFinalVideoUrl, pauseSession, retryScene } from "./api/client";

/**
 * No project-list screen exists in the PRD or backlog (design.md § Open
 * Questions 1; recorded as a product gap, not invented here). This prototype
 * is built against identifier-based access only (consult-session, JOS-135,
 * Decision 5): the session's address — its id in the URL — is the bookmark.
 */
function sessionIdFromUrl(): string | undefined {
  return new URLSearchParams(window.location.search).get("sessionId") ?? undefined;
}

export default function App() {
  const [sessionId, setSessionId] = useState<string | undefined>(sessionIdFromUrl);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | undefined>(undefined);
  const { snapshot, connected, error } = useLiveSession(sessionId);

  const handleStart = useCallback(async (values: StartProjectValues) => {
    setStarting(true);
    setStartError(undefined);
    try {
      // Prototype stand-in: a real project starts one voice-over generation,
      // not pre-created scenes. This proves the screens the PRD lists (start
      // -> session -> scenes), not the decomposition pipeline (out of scope
      // here; see the backend skeleton's own scope note).
      const scriptSentences = values.script.split(/(?<=[.!?])\s+/).filter(Boolean);
      const scenes = (scriptSentences.length > 0 ? scriptSentences : [values.script]).map((sentence) => ({
        mode: "success",
        latencyMs: 800,
        instruction: sentence.slice(0, 200),
      }));
      const snapshot = await createSession({ title: values.title, language: values.language, scenes });
      const newSessionId = snapshot.session.sessionId;
      const url = new URL(window.location.href);
      url.searchParams.set("sessionId", newSessionId);
      window.history.pushState({}, "", url);
      setSessionId(newSessionId);
    } catch (err) {
      setStartError(String(err));
    } finally {
      setStarting(false);
    }
  }, []);

  if (!sessionId) {
    return (
      <main>
        <h1>Vid4You (prototype)</h1>
        <StartProjectForm onStart={handleStart} submitting={starting} />
        {startError && <p role="alert">{startError}</p>}
      </main>
    );
  }

  return (
    <main>
      <h1>Vid4You (prototype)</h1>
      <p>
        Session: <code>{sessionId}</code> — {connected ? "connected" : "connecting…"}
      </p>
      {error && <p role="alert">{error}</p>}
      {snapshot && (
        <>
          <SessionHeader
            session={snapshot.session}
            onPause={() => pauseSession(sessionId)}
            onContinue={() => continueSession(sessionId)}
          />
          <SceneList
            sessionId={sessionId}
            scenes={snapshot.scenes}
            onRetry={(sceneId) => retryScene(sessionId, sceneId)}
            onCorrect={(sceneId, instruction) => correctScene(sessionId, sceneId, instruction)}
          />
          <FinalVideoDownload state={snapshot.session.state} url={downloadFinalVideoUrl(sessionId)} />
        </>
      )}
    </main>
  );
}
