import { useEffect, useState } from "react";
import { getPipelineTimeReport, getProviderUsageReport } from "../api/client";
import type { PipelineTimeReport, ProviderStage, ProviderUsageReport, ReportPeriod } from "../types";
import { PipelineTimeTables } from "./PipelineTimeTables";
import { ReportPeriodSelector, lastDays } from "./ReportPeriodSelector";

const STAGE_LABELS: Record<ProviderStage, string> = { reasoning: "Reasoning", voice: "Voice", alignment: "Alignment", image: "Image", video: "Video" };
const UNIT_LABELS: Record<string, string> = { voice_characters: "characters", audio_seconds: "audio seconds", requests: "requests", images: "images", clip_seconds: "clip seconds" };
const HEADERS = ["Stage", "Provider", "Attempts", "Successes", "Transient failures", "Not-retryable failures", "Timed out", "Success rate", "Median latency", "95th-percentile latency", "Billed units"];

const number = new Intl.NumberFormat("en");
const latency = (ms: number | null) => (ms === null ? "—" : `${number.format(ms)} ms`);

interface Props {
  password: string;
  /** An Administrator request was refused with 401: the page locks again. */
  onDenied: () => void;
}

/**
 * report-provider-usage (JOS-223), design Decision 7 — the "Reports" section of `/admin`: a period (last 30 days at first)
 * and the provider-usage table. JOS-224 and JOS-225 add their reports under the same period; JOS-228 adds the pipeline time.
 */
export function ReportsSection({ password, onDenied }: Props) {
  const [period, setPeriod] = useState<ReportPeriod>(() => lastDays(30));
  const [report, setReport] = useState<ProviderUsageReport | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [pipeline, setPipeline] = useState<PipelineTimeReport | undefined>(undefined);
  const [pipelineError, setPipelineError] = useState<string | undefined>(undefined);

  useEffect(() => {
    let current = true;
    let denied = false;
    // Both reports answer 401 together when the password is wrong; the page locks once.
    const deny = () => {
      if (current && !denied) {
        denied = true;
        onDenied();
      }
    };
    getProviderUsageReport(password, period).then(
      (result) => {
        if (!current) return;
        if (result.kind === "denied") deny();
        else setReport(result.report);
      },
      () => current && setError("Could not load the provider usage report. Is the app running?"),
    );
    getPipelineTimeReport(password, period).then(
      (result) => {
        if (!current) return;
        if (result.kind === "denied") deny();
        else setPipeline(result.report);
      },
      () => current && setPipelineError("Could not load the pipeline time report. Is the app running?"),
    );
    return () => {
      current = false;
    };
    // The password and the lock callback do not change while the section is shown.
  }, [period]);

  // The errors of the previous period go as soon as another one is chosen (in the handler, not in the effect).
  const changePeriod = (next: ReportPeriod) => {
    setPeriod(next);
    setError(undefined);
    setPipelineError(undefined);
  };

  const showsSceneStage = report?.rows.some((row) => row.stage === "image" || row.stage === "video");

  return (
    <section aria-label="Reports" className="field">
      <h2>Reports</h2>
      <ReportPeriodSelector onChange={changePeriod} />
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {report === undefined && !error && <p className="session-loading">Loading the report…</p>}
      {report?.rows.length === 0 && <p>No provider activity in this period.</p>}
      {report && report.rows.length > 0 && (
        <table>
          <caption>Provider usage</caption>
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
            {report.rows.map((row) => (
              <tr key={`${row.stage}:${row.providerId}`}>
                <td>{STAGE_LABELS[row.stage]}</td>
                <td>{row.providerLabel}</td>
                <td>{number.format(row.attempts)}</td>
                <td>{number.format(row.successes)}</td>
                <td>{number.format(row.transient)}</td>
                <td>{number.format(row.notRetryable)}</td>
                <td>{number.format(row.timedOut)}</td>
                <td>{`${number.format(row.successRatePercent)}%`}</td>
                <td>{latency(row.medianLatencyMs)}</td>
                <td>{latency(row.p95LatencyMs)}</td>
                <td>{`${number.format(row.billedUnits)} ${UNIT_LABELS[row.unit] ?? row.unit}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {report?.sceneAttemptsFollowCurrentProvider && showsSceneStage && <p>Image and clip attempts are counted for the scene's current provider.</p>}
      {pipelineError && (
        <p role="alert" className="form-error">
          {pipelineError}
        </p>
      )}
      {pipeline && <PipelineTimeTables report={pipeline} />}
    </section>
  );
}
