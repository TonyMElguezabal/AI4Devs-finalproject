import type { AppVersion } from "../types";
import { Icon } from "./Icon";

interface Props {
  /** Present on a session page only: whether the live connection is open. Absent: no indicator is shown. */
  connected?: boolean;
  /** Present on a session page only: returns to the start form. Absent: no button is shown. */
  onNewProject?: () => void;
  /** add-observability-telemetry (JOS-199): reopens the privacy choices. Absent: no button is shown. */
  onOpenPrivacy?: () => void;
  /** show-app-version (JOS-238): the running build. Absent (not loaded, or the request failed): no label is shown. */
  appVersion?: AppVersion;
}

/** design Decision 2 — the development channel has no meaningful version to quote; a uat build is told apart from a release. */
function versionText({ version, channel }: AppVersion): string {
  if (channel === "development") return "Development build";
  return channel === "uat" ? `v${version} · uat` : `v${version}`;
}

/** redesign-visual-design (JOS-198), design Decision 4 — the wordmark, the connection indicator and "New project". */
export function TopBar({ connected, onNewProject, onOpenPrivacy, appVersion }: Props) {
  return (
    <header className="top-bar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          <Icon name="play" />
        </span>
        Vid4You
      </div>
      {connected !== undefined && (
        <span className={`connection${connected ? "" : " connecting"}`}>
          <span className="connection-dot" aria-hidden="true" />
          {connected ? "Live" : "Connecting…"}
        </span>
      )}
      {onOpenPrivacy && (
        <button type="button" className="privacy-button" onClick={onOpenPrivacy}>
          Privacy
        </button>
      )}
      {onNewProject && (
        <button type="button" onClick={onNewProject}>
          <Icon name="plus" />
          New project
        </button>
      )}
      {appVersion && (
        <span className="app-version" aria-label={`Vid4You version ${appVersion.version}`}>
          {versionText(appVersion)}
        </span>
      )}
    </header>
  );
}
