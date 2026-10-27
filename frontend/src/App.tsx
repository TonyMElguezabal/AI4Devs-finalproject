import { useCallback, useEffect, useState } from "react";
import { StartProjectForm, type StartProjectValues, type SupportedLanguage } from "./components/StartProjectForm";
import { SessionPage } from "./components/SessionPage";
import { TopBar } from "./components/TopBar";
import { TelemetryConsentDialog } from "./components/TelemetryConsentDialog";
import { UpdateBanner } from "./components/UpdateBanner";
import { AdminTools } from "./components/AdminTools";
import { AdminPage } from "./components/AdminPage";
import type { TelemetryConsent } from "./types";
import { useLiveSession } from "./api/useLiveSession";
import {
  correctScene,
  createSession,
  continueSession,
  fetchLanguages,
  getTelemetryConsent,
  saveTelemetryConsent,
  pauseSession,
  rebuildFinalVideo,
  retryAssembly,
  retryDecomposition,
  retryScene,
  retryVoiceOver,
  setScenePause,
} from "./api/client";

/**
 * No project-list screen exists in the PRD or backlog (design.md § Open
 * Questions 1; recorded as a product gap, not invented here). This prototype
 * is built against identifier-based access only (consult-session, JOS-135,
 * Decision 5): the session's address — its id in the URL — is the bookmark.
 */
function sessionIdFromUrl(): string | undefined {
  return new URLSearchParams(window.location.search).get("sessionId") ?? undefined;
}

/**
 * protect-admin-with-password (JOS-173), design Decision 5 — `/admin` is chosen before any of the regular page's
 * state exists, so it never loads the privacy prompt, the languages or a live session. There is no router. The page
 * is not linked from the top bar: the Administrator opens the address directly.
 */
export default function App() {
  if (window.location.pathname === "/admin") {
    return (
      <>
        <TopBar />
        <main className="app-main">
          <AdminPage tools={(context) => <AdminTools {...context} />} />
        </main>
      </>
    );
  }
  return <RegularApp />;
}

function RegularApp() {
  const [sessionId, setSessionId] = useState<string | undefined>(sessionIdFromUrl);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | undefined>(undefined);
  const [languages, setLanguages] = useState<SupportedLanguage[]>([]);
  const { snapshot, connected, notFound } = useLiveSession(sessionId);

  // add-observability-telemetry (JOS-199) — the consent prompt opens once, while the answer is still missing; the
  // "Privacy" button reopens it. A failed request leaves it closed: telemetry stays off.
  const [consent, setConsent] = useState<TelemetryConsent | undefined>(undefined);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  useEffect(() => {
    getTelemetryConsent()
      .then((loaded) => {
        setConsent(loaded);
        if (!loaded.answered) setPrivacyOpen(true);
      })
      .catch(() => setConsent(undefined));
  }, []);
  const privacy = (
    <>
      <UpdateBanner />
      <TelemetryConsentDialog
        open={privacyOpen}
        consent={consent}
        onSave={async (choices) => setConsent(await saveTelemetryConsent(choices))}
        onClose={() => setPrivacyOpen(false)}
        // eslint-disable-next-line @typescript-eslint/no-misused-promises -- the handler catches its own failure
        onDismiss={async () => {
          // "Not now" counts as an answer, but only the first time: an answered consent keeps its saved choices.
          if (consent && !consent.answered) {
            try {
              setConsent(await saveTelemetryConsent({ errors: false, providerUsage: false, productUsage: false }));
            } catch {
              // still closes; the prompt returns on the next launch
            }
          }
          setPrivacyOpen(false);
        }}
      />
    </>
  );

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
      <>
        <TopBar onOpenPrivacy={() => setPrivacyOpen(true)} />
        {privacy}
        <main className="app-main">
          {/* eslint-disable-next-line @typescript-eslint/no-misused-promises -- handleStart catches its own failure */}
          <StartProjectForm onStart={handleStart} languages={languages} submitting={starting} error={startError} />
        </main>
      </>
    );
  }

  return (
    <>
      <TopBar connected={notFound ? undefined : connected} onNewProject={handleStartNew} onOpenPrivacy={() => setPrivacyOpen(true)} />
      {privacy}
      <main className="app-main">
        <SessionPage
          sessionId={sessionId}
          snapshot={snapshot}
          notFound={notFound}
          onStartNew={handleStartNew}
          onPause={() => pauseSession(sessionId)}
          onContinue={() => continueSession(sessionId)}
          onRetry={(sceneId) => retryScene(sessionId, sceneId)}
          onCorrect={(sceneId, instruction) => correctScene(sessionId, sceneId, instruction)}
          onSetPause={(sceneId, seconds) => setScenePause(sessionId, sceneId, seconds)}
          onRebuildFinalVideo={() => rebuildFinalVideo(sessionId)}
          onRetryPhase={(phase) => {
            if (phase === "voice-over") return retryVoiceOver(sessionId);
            if (phase === "decomposition") return retryDecomposition(sessionId);
            if (phase === "assembly") return retryAssembly(sessionId);
            return Promise.reject(new Error("not-retryable"));
          }}
        />
      </main>
    </>
  );
}
