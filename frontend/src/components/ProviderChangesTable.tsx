import type { ProviderChangesReport, ProviderStage } from "../types";

const STAGE_LABELS: Record<ProviderStage, string> = { reasoning: "Reasoning", voice: "Voice", alignment: "Alignment", image: "Image", video: "Video" };
const KIND_LABELS = { "active-provider": "Active provider changed", "failed-stage-move": "Failed stage moved" } as const;
const HEADERS = ["When", "What", "Stage", "Session", "Scene", "From", "To"];

/** record-provider-changes (JOS-229), design Decision 5 — the provider-change log of the period, newest first, in the computer's time zone. */
export function ProviderChangesTable({ report }: { report: ProviderChangesReport }) {
  if (report.entries.length === 0) return <p>There were no provider changes in this period.</p>;
  return (
    <table>
      <caption>Provider changes</caption>
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
        {report.entries.map((entry, index) => (
          <tr key={`${entry.changedAt}:${index}`}>
            <td>{new Date(entry.changedAt).toLocaleString()}</td>
            <td>{KIND_LABELS[entry.kind]}</td>
            <td>{STAGE_LABELS[entry.stage]}</td>
            <td>{entry.sessionTitle ?? ""}</td>
            <td>{entry.sceneNumber ?? ""}</td>
            <td>{entry.previousProviderLabel}</td>
            <td>{entry.newProviderLabel}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
