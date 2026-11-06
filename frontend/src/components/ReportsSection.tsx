import { useEffect, useRef, useState } from "react";
import { getEstimatedCostReport, getFailuresReport, getPipelineTimeReport, getProviderChangesReport, getProviderUsageReport } from "../api/client";
import type { EstimatedCostReport, FailuresReport, PipelineTimeReport, ProviderChangesReport, ProviderStage, ProviderUsageReport, ReportPeriod } from "../types";
import { EstimatedCostTable, formatCosts } from "./EstimatedCostTable";
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

  // admin-tabs-and-tables (JOS-270), Decision 6 — the tiles read what is already loaded; a report that is not loaded gives a dash.
  const attempts = report?.rows.reduce((sum, row) => sum + row.attempts, 0);
  const successes = report?.rows.reduce((sum, row) => sum + row.successes, 0);
  const successRate = attempts === undefined || successes === undefined ? undefined : attempts === 0 ? 0 : Math.round((successes / attempts) * 1000) / 10;
  const tiles: [string, string][] = [
    ["Attempts", attempts === undefined ? "—" : number.format(attempts)],
    ["Success rate", successRate === undefined ? "—" : `${number.format(successRate)}%`],
    ["Estimated cost", cost === undefined || cost.totals.length === 0 ? "—" : formatCosts(cost.totals)],
    ["Failed scenes now", failures === undefined ? "—" : number.format(failures.failedScenesNow.image + failures.failedScenesNow.video)],
  ];

  return (
    <section aria-label="Reports" className="field">
      <h2>Reports</h2>
      <ReportPeriodSelector onChange={changePeriod} />
      <div role="group" aria-label="Summary">
        <dl className="summary-tiles">
          {tiles.map(([name, value]) => (
            <div key={name}>
              <dt>{name}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </div>
      <details className="report-panel" open>
        <summary>Provider usage</summary>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        {report === undefined && !error && <p className="session-loading">Loading the report…</p>}
        {report?.rows.length === 0 && <p>No provider activity in this period.</p>}
        {report && report.rows.length > 0 && (
          <div className="table-scroll">
            <table className="data-table">
              <caption>Provider usage</caption>
              <thead>
                <tr>
                  {HEADERS.map((header, index) => (
                    <th key={header} scope="col" className={index >= 2 ? "num" : undefined}>
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
                    <td className="num">{number.format(row.attempts)}</td>
                    <td className="num">{number.format(row.successes)}</td>
                    <td className="num">{number.format(row.transient)}</td>
                    <td className="num">{number.format(row.notRetryable)}</td>
                    <td className="num">{number.format(row.timedOut)}</td>
                    <td className="num">{`${number.format(row.successRatePercent)}%`}</td>
                    <td className="num">{latency(row.medianLatencyMs)}</td>
                    <td className="num">{latency(row.p95LatencyMs)}</td>
                    <td className="num">{`${number.format(row.billedUnits)} ${UNIT_LABELS[row.unit] ?? row.unit}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {report?.sceneAttemptsFollowCurrentProvider && showsSceneStage && <p className="table-note">Image and clip attempts are counted for the scene's current provider.</p>}
      </details>
      <details className="report-panel">
        <summary>Estimated cost</summary>
        {costError && (
          <p role="alert" className="form-error">
            {costError}
          </p>
        )}
        {cost && <EstimatedCostTable report={cost} />}
      </details>
      <details className="report-panel">
        <summary>Pipeline time</summary>
        {pipelineError && (
          <p role="alert" className="form-error">
            {pipelineError}
          </p>
        )}
        {pipeline && <PipelineTimeTables report={pipeline} />}
      </details>
      <details className="report-panel">
        <summary>Failures and retries</summary>
        {failuresError && (
          <p role="alert" className="form-error">
            {failuresError}
          </p>
        )}
        {failures && <FailuresTables report={failures} />}
      </details>
      <details className="report-panel">
        <summary>Provider changes</summary>
        {changesError && (
          <p role="alert" className="form-error">
            {changesError}
          </p>
        )}
        {changes && <ProviderChangesTable report={changes} />}
      </details>
      <details className="report-panel" open>
        <summary>Sessions</summary>
        <SessionsReport password={password} period={period} onDenied={lockOnce} />
      </details>
    </section>
  );
}
