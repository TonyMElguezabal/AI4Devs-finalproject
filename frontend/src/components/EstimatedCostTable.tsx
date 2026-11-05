import type { CurrencyTotal, EstimatedCostReport, ProviderStage } from "../types";

const STAGE_LABELS: Record<ProviderStage, string> = { reasoning: "Reasoning", voice: "Voice", alignment: "Alignment", image: "Image", video: "Video" };
const UNIT_LABELS: Record<string, string> = { voice_characters: "characters", audio_seconds: "audio seconds", requests: "requests", images: "images", clip_seconds: "clip seconds" };
const HEADERS = ["Stage", "Provider", "Billed units", "Failed units (not priced)", "Price per unit", "Estimated cost"];

const number = new Intl.NumberFormat("en");
const price = new Intl.NumberFormat("en", { maximumFractionDigits: 6 });
const units = (value: number, unit: string) => `${number.format(value)} ${UNIT_LABELS[unit] ?? unit}`;

/** An amount with its currency code, rounded to the currency's minor unit, for example "USD 1.70". */
export function formatCost(amount: number, currency: string): string {
  return new Intl.NumberFormat("en", { style: "currency", currency, currencyDisplay: "code" }).format(amount).replace(/\u00a0/g, " ");
}

/** "EUR 1.70, USD 0.25": one amount per currency, never added together. */
export const formatCosts = (totals: readonly CurrencyTotal[]) => totals.map((total) => formatCost(total.estimatedCost, total.currency)).join(", ");

/**
 * report-estimated-cost (JOS-227), design Decision 6 — billed units times each provider's current price, with one total per
 * currency. An unpriced provider has no amount and is left out of the totals; the empty period is told by the usage table.
 */
export function EstimatedCostTable({ report }: { report: EstimatedCostReport }) {
  if (report.rows.length === 0) return null;
  return (
    <>
      <table>
        <caption>Estimated cost (estimates, in each provider's currency)</caption>
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
          {report.rows.map((row) => {
            const cost = row.estimatedCost === null || row.currency === null ? null : formatCost(row.estimatedCost, row.currency);
            return (
              <tr key={`${row.stage}:${row.providerId}`}>
                <td>{STAGE_LABELS[row.stage]}</td>
                <td>{row.providerLabel}</td>
                <td>{units(row.billedUnits, row.unit)}</td>
                <td>{units(row.failedUnits, row.unit)}</td>
                <td>{row.pricePerUnit === null ? "Unpriced" : `${price.format(row.pricePerUnit)} ${row.currency}`}</td>
                <td aria-label={`Estimated cost of ${row.providerLabel}: ${cost === null ? "unpriced" : `${cost} (estimate)`}`}>{cost ?? "Unpriced"}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          {report.totals.map((total) => (
            <tr key={total.currency}>
              <td colSpan={HEADERS.length - 1}>{`Total in ${total.currency}`}</td>
              <td aria-label={`Total in ${total.currency}: ${formatCost(total.estimatedCost, total.currency)} (estimate)`}>{formatCost(total.estimatedCost, total.currency)}</td>
            </tr>
          ))}
        </tfoot>
      </table>
      {report.totalsExcludeUnpriced && <p>The totals exclude unpriced providers.</p>}
      <p>Failed units are shown but not priced; a vendor may still bill some failed requests, such as a rejected input.</p>
    </>
  );
}
