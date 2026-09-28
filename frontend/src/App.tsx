import { useCallback, useEffect, useState } from "react";
import { StartProjectForm, type StartProjectValues, type SupportedLanguage } from "./components/StartProjectForm";
import { SessionPage } from "./components/SessionPage";
import { useLiveSession } from "./api/useLiveSession";
import { correctScene, createSession, continueSession, fetchLanguages, pauseSession, retryScene } from "./api/client";

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
  const [languages, setLanguages] = useState<SupportedLanguage[]>([]);
  const { snapshot, connected, notFound } = useLiveSession(sessionId);

  // start-video-project (JOS-134) Decision 5 — fetched from the backend,
  // never a second hardcoded copy.
  useEffect(() => {
    fetchLanguages().then(setLanguages).catch(() => setLanguages([]));
  }, []);

  const handleStart = useCallback(async (values: StartProjectValues) => {
    setStarting(true);
    setStartError(undefined);
    try {
      // PRD §5 step 1 — registration only. No scenes are created and no
      // provider is called here (Decision 8): decomposition (US-07..US-09)
      // hasn't run yet, so there is nothing to launch.
      const snapshot = await createSession({ title: values.title, script: values.script, language: values.language });
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

  // consult-session (JOS-135) task 4.4 — the not-found page's "way to start
  // a new project": clears the address back to the start form.
  const handleStartNew = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete("sessionId");
    window.history.pushState({}, "", url);
    setSessionId(undefined);
  }, []);

  if (!sessionId) {
    return (
      <main className="app-shell">
        <h1 className="app-title">Vid4You (prototype)</h1>
        <StartProjectForm onStart={handleStart} languages={languages} submitting={starting} />
        {startError && <p role="alert">{startError}</p>}
      </main>
    );
  }

  return (
    <main className="app-shell">
      <h1 className="app-title">Vid4You (prototype)</h1>
      <SessionPage
        sessionId={sessionId}
        snapshot={snapshot}
        connected={connected}
        notFound={notFound}
        onStartNew={handleStartNew}
        onPause={() => pauseSession(sessionId)}
        onContinue={() => continueSession(sessionId)}
        onRetry={(sceneId) => retryScene(sessionId, sceneId)}
        onCorrect={(sceneId, instruction) => correctScene(sessionId, sceneId, instruction)}
      />
    </main>
  );
}
