import { useEffect, useRef, useState } from "react";
import { getEstimatedCostReport, getFailuresReport, getPipelineTimeReport, getProviderChangesReport, getProviderUsageReport } from "../api/client";
import type { EstimatedCostReport, FailuresReport, PipelineTimeReport, ProviderChangesReport, ProviderStage, ProviderUsageReport, ReportPeriod } from "../types";
import { EstimatedCostTable } from "./EstimatedCostTable";
import { FailuresTables } from "./FailuresTables";
import { PipelineTimeTables } from "./PipelineTimeTables";
import { ProviderChangesTable } from "./ProviderChangesTable";
import { ReportPeriodSelector, lastDays } from "./ReportPeriodSelector";
import { SessionsReport } from "./SessionsReport";

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
 * and the provider-usage table. JOS-228 adds the pipeline time, JOS-224 the failures and retries, JOS-225 the sessions list, JOS-229 the provider changes,
 * JOS-227 the estimated cost.
 */
export function ReportsSection({ password, onDenied }: Props) {
  const [period, setPeriod] = useState<ReportPeriod>(() => lastDays(30));
  const [report, setReport] = useState<ProviderUsageReport | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [pipeline, setPipeline] = useState<PipelineTimeReport | undefined>(undefined);
  const [pipelineError, setPipelineError] = useState<string | undefined>(undefined);
  // The sessions report answers its own 401, so the lock is shared: the page locks once however many reports are refused.
  const lockedRef = useRef(false);
  const lockOnce = () => {
    if (!lockedRef.current) {
      lockedRef.current = true;
      onDenied();
    }
  };
  const [failures, setFailures] = useState<FailuresReport | undefined>(undefined);
  const [failuresError, setFailuresError] = useState<string | undefined>(undefined);
  const [changes, setChanges] = useState<ProviderChangesReport | undefined>(undefined);
  const [changesError, setChangesError] = useState<string | undefined>(undefined);
  const [cost, setCost] = useState<EstimatedCostReport | undefined>(undefined);
  const [costError, setCostError] = useState<string | undefined>(undefined);

  useEffect(() => {
    let current = true;
    let denied = false;
    // All reports answer 401 together when the password is wrong; the page locks once.
    const deny = () => {
      if (current && !denied) {
        denied = true;
        lockOnce();
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
    getEstimatedCostReport(password, period).then(
      (result) => {
        if (!current) return;
        if (result.kind === "denied") deny();
        else setCost(result.report);
      },
      () => current && setCostError("Could not load the estimated cost report. Is the app running?"),
    );
    getPipelineTimeReport(password, period).then(
      (result) => {
        if (!current) return;
        if (result.kind === "denied") deny();
        else setPipeline(result.report);
      },
      () => current && setPipelineError("Could not load the pipeline time report. Is the app running?"),
    );
    getFailuresReport(password, period).then(
      (result) => {
        if (!current) return;
        if (result.kind === "denied") deny();
        else setFailures(result.report);
      },
      () => current && setFailuresError("Could not load the failures and retries report. Is the app running?"),
    );
    getProviderChangesReport(password, period).then(
      (result) => {
        if (!current) return;
        if (result.kind === "denied") deny();
        else setChanges(result.report);
      },
      () => current && setChangesError("Could not load the provider changes report. Is the app running?"),
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
    setFailuresError(undefined);
    setChangesError(undefined);
    setCostError(undefined);
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
      {costError && (
        <p role="alert" className="form-error">
          {costError}
        </p>
      )}
      {cost && <EstimatedCostTable report={cost} />}
      {pipelineError && (
        <p role="alert" className="form-error">
          {pipelineError}
        </p>
      )}
      {pipeline && <PipelineTimeTables report={pipeline} />}
      {failuresError && (
        <p role="alert" className="form-error">
          {failuresError}
        </p>
      )}
      {failures && <FailuresTables report={failures} />}
      {changesError && (
        <p role="alert" className="form-error">
          {changesError}
        </p>
      )}
      {changes && <ProviderChangesTable report={changes} />}
      <SessionsReport password={password} period={period} onDenied={lockOnce} />
    </section>
  );
}
