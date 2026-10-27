import { Fragment, useEffect, useState } from "react";
import { getSessionScenesReport, getSessionsReport } from "../api/client";
import type { ReportPeriod, SceneReportRow, SessionReportRow, SessionScenesReport, SessionsReport as SessionsReportData } from "../types";

const HEADERS = ["Session", "Created", "State", "Paused", "Scenes", "Failed scenes", "Attempts", "Seconds to voice-over", "Seconds to final video", "Details"];
const SCENE_HEADERS = ["Scene", "Status", "Image provider", "Clip provider", "Image requests", "Clip requests", "Requested duration", "Speed factor", "Duration warning", "Speed-factor warning"];

const number = new Intl.NumberFormat("en", { maximumFractionDigits: 1 });
const dash = "—";
const seconds = (value: number | null) => (value === null ? dash : `${number.format(value)} s`);
const created = (iso: string) => new Date(iso).toLocaleString("en", { dateStyle: "medium", timeStyle: "short" });
const stateText = (row: SessionReportRow) => (row.state === "final-video-ready" ? "Final video ready" : row.state === "failed" ? `Failed in ${row.failedPhase}` : "In progress");
/** A stored warning is an enum such as `exceeds-maximum`; it reads as words. */
const warningText = (value: string | null) => (value === null ? dash : value.replace(/-/g, " "));

interface Props {
  password: string;
  period: ReportPeriod;
  /** An Administrator request was refused with 401: the page locks again. */
  onDenied: () => void;
}

/** What the list request ended with, for the period it was made for (a result of another period is not shown). */
type ListState = { period: ReportPeriod; outcome: "error" } | { period: ReportPeriod; outcome: "ok"; report: SessionsReportData };

/**
 * report-sessions (JOS-225), design Decision 7 — the sessions table of the Reports section and, per session, a drill-down
 * to its scenes that loads the first time it is opened. Only the session title is text the User wrote.
 */
export function SessionsReport({ password, period, onDenied }: Props) {
  const [list, setList] = useState<ListState | undefined>(undefined);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [scenes, setScenes] = useState<Record<string, SessionScenesReport | "error">>({});

  useEffect(() => {
    let current = true;
    getSessionsReport(password, period).then(
      (result) => {
        if (!current) return;
        if (result.kind === "denied") onDenied();
        else setList({ period, outcome: "ok", report: result.report });
      },
      () => current && setList({ period, outcome: "error" }),
    );
    return () => {
      current = false;
    };
    // The password and the lock callback do not change while the section is shown.
  }, [period]);

  const toggle = (sessionId: string) => {
    const opening = !open[sessionId];
    setOpen((previous) => ({ ...previous, [sessionId]: opening }));
    if (!opening || (scenes[sessionId] && scenes[sessionId] !== "error")) return;
    getSessionScenesReport(password, sessionId).then(
      (result) => {
        if (result.kind === "denied") onDenied();
        else setScenes((previous) => ({ ...previous, [sessionId]: result.report }));
      },
      () => setScenes((previous) => ({ ...previous, [sessionId]: "error" })),
    );
  };

  if (list === undefined || list.period !== period) return <p className="session-loading">Loading the sessions report…</p>;
  if (list.outcome === "error") {
    return (
      <p role="alert" className="form-error">
        Could not load the sessions report. Is the app running?
      </p>
    );
  }
  if (list.report.rows.length === 0) return <p>No sessions were created in this period.</p>;

  return (
    <table>
      <caption>Sessions</caption>
      <thead>
        <tr>
          {HEADERS.map((header) => (
            <th key={header} scope="col">
              {header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {list.report.rows.map((row) => (
          <Fragment key={row.id}>
            <tr>
              <td>{row.title}</td>
              <td>{created(row.createdAt)}</td>
              <td>{stateText(row)}</td>
              <td>{row.paused ? "Paused" : dash}</td>
              <td>{number.format(row.scenes)}</td>
              <td>{number.format(row.failedScenes)}</td>
              <td>{number.format(row.attempts)}</td>
              <td>{seconds(row.secondsToVoiceOver)}</td>
              <td>{seconds(row.secondsToFinalVideo)}</td>
              <td>
                <button type="button" aria-expanded={Boolean(open[row.id])} aria-label={`Scenes of ${row.title}`} onClick={() => toggle(row.id)}>
                  Scenes
                </button>
              </td>
            </tr>
            {open[row.id] && (
              <tr>
                <td colSpan={HEADERS.length}>
                  <SceneTable title={row.title} scenes={scenes[row.id]} />
                </td>
              </tr>
            )}
          </Fragment>
        ))}
      </tbody>
    </table>
  );
}

function SceneTable({ title, scenes }: { title: string; scenes: SessionScenesReport | "error" | undefined }) {
  if (scenes === undefined) return <p className="session-loading">Loading the scenes…</p>;
  if (scenes === "error") {
    return (
      <p role="alert" className="form-error">
        Could not load the scenes of this session. Is the app running?
      </p>
    );
  }
  if (scenes.rows.length === 0) return <p>This session has no scenes.</p>;
  return (
    <table>
      <caption>{`Scenes of ${title}`}</caption>
      <thead>
        <tr>
          {SCENE_HEADERS.map((header) => (
            <th key={header} scope="col">
              {header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {scenes.rows.map((scene: SceneReportRow) => (
          <tr key={scene.number}>
            <td>{scene.number}</td>
            <td>{scene.status}</td>
            <td>{scene.imageProvider ?? dash}</td>
            <td>{scene.clipProvider ?? dash}</td>
            <td>{number.format(scene.imageAttempts)}</td>
            <td>{number.format(scene.clipAttempts)}</td>
            <td>{seconds(scene.requestedDurationSeconds)}</td>
            <td>{scene.speedFactor === null ? dash : `${number.format(scene.speedFactor)}×`}</td>
            <td>{warningText(scene.durationWarning)}</td>
            <td>{warningText(scene.speedFactorWarning)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
