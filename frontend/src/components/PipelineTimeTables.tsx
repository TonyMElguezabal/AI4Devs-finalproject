import { NOT_RECORDED } from "../format";
import type { PipelinePhase, PipelineTimeReport } from "../types";

const PHASE_LABELS: Record<PipelinePhase, string> = { "voice-over": "Voice-over", decomposition: "Decomposition", scenes: "Scenes", assembly: "Assembly" };
const PHASES = Object.keys(PHASE_LABELS) as PipelinePhase[];

const number = new Intl.NumberFormat("en", { maximumFractionDigits: 1 });
const seconds = (value: number | null) => (value === null ? "—" : `${number.format(value)} s`);
/** A `null` count is NOT_RECORDED (scene attempts store no time-out outcome), which is not the same as 0. */
const count = (value: number | null) => (value === null ? NOT_RECORDED : number.format(value));

/**
 * record-phase-instants-and-pipeline-report (JOS-228), design Decisions 4 and 5 — the pipeline-time report: elapsed
 * seconds per phase (aggregated, then per session) and the attempts that timed out, finished late or were superseded.
 */
export function PipelineTimeTables({ report }: { report: PipelineTimeReport }) {
  if (report.sessions.length === 0 && report.phases.every((row) => !row.timedOut && !row.finishedLate && !row.superseded)) {
    return <p>No pipeline activity in this period.</p>;
  }
  return (
    <>
      <div className="table-scroll"><table className="data-table">
        <caption>Pipeline time</caption>
        <thead>
          <tr>
            {["Phase", "Sessions", "Median time", "95th-percentile time", "Timed out", "Finished late", "Superseded"].map((header, index) => (
              <th key={header} scope="col" className={index >= 1 ? "num" : undefined}>
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {report.phases.map((row) => (
            <tr key={row.phase}>
              <td>{PHASE_LABELS[row.phase]}</td>
              <td className="num">{number.format(row.sessions)}</td>
              <td className="num">{seconds(row.medianSeconds)}</td>
              <td className="num">{seconds(row.p95Seconds)}</td>
              <td className="num">{count(row.timedOut)}</td>
              <td className="num">{count(row.finishedLate)}</td>
              <td className="num">{count(row.superseded)}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
      {report.sessions.length > 0 && (
        <div className="table-scroll"><table className="data-table">
          <caption>Pipeline time per session</caption>
          <thead>
            <tr>
              <th scope="col">Session</th>
              {PHASES.map((phase) => (
                <th key={phase} scope="col" className="num">
                  {PHASE_LABELS[phase]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {report.sessions.map((session) => (
              <tr key={session.runId}>
                <td>{session.title}</td>
                {PHASES.map((phase) => (
                  <td key={phase}>{seconds(session.seconds[phase])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </>
  );
}
