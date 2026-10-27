import type { FailuresReport, ProviderStage } from "../types";

const STAGE_LABELS: Record<ProviderStage, string> = { reasoning: "Reasoning", voice: "Voice", alignment: "Alignment", image: "Image", video: "Video" };

const number = new Intl.NumberFormat("en");
/** A `null` count is "not recorded" (scenes keep no retry cycles), which is not the same as 0. */
const count = (value: number | null) => (value === null ? "not recorded" : number.format(value));

const FAILURE_HEADERS = ["Stage", "Transient failures", "Not-retryable failures", "Timed out", "Retry budgets exhausted", "Manual retries"];

/**
 * report-failures-and-retries (JOS-224), design Decision 7 — the failures report: failed attempts per stage, the session-level failure
 * wordings, and the scenes failed right now (a state that ignores the period).
 */
export function FailuresTables({ report }: { report: FailuresReport }) {
  return (
    <>
      {report.stages.length === 0 ? (
        <p>No failures or retries in this period.</p>
      ) : (
        <table>
          <caption>Failures and retries</caption>
          <thead>
            <tr>
              {FAILURE_HEADERS.map((header) => (
                <th key={header} scope="col">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {report.stages.map((row) => (
              <tr key={row.stage}>
                <td>{STAGE_LABELS[row.stage]}</td>
                <td>{number.format(row.transient)}</td>
                <td>{number.format(row.notRetryable)}</td>
                <td>{number.format(row.timedOut)}</td>
                <td>{count(row.budgetsExhausted)}</td>
                <td>{count(row.manualRetries)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {report.wordings.length > 0 && (
        <table>
          <caption>Most frequent failure wordings</caption>
          <thead>
            <tr>
              {["Stage", "Wording", "Attempts"].map((header) => (
                <th key={header} scope="col">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {report.wordings.map((entry) => (
              <tr key={`${entry.stage}:${entry.message}`}>
                <td>{STAGE_LABELS[entry.stage]}</td>
                <td>{entry.message}</td>
                <td>{number.format(entry.attempts)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <table>
        <caption>Scenes failed now</caption>
        <thead>
          <tr>
            <th scope="col">Failed at</th>
            <th scope="col">Scenes</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Image</td>
            <td>{number.format(report.failedScenesNow.image)}</td>
          </tr>
          <tr>
            <td>Clip</td>
            <td>{number.format(report.failedScenesNow.video)}</td>
          </tr>
        </tbody>
      </table>
      <p>These are the scenes that are failed right now, whatever period is chosen.</p>
    </>
  );
}
