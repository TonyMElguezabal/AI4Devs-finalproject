import { z } from "zod";
import { db } from "./db.ts";
import { PRICE_SHAPE } from "./providerTypes.ts";
import { STAGE_ORDER, countedAttempts, countedAttemptsOfRuns, type CountedAttempt, type ReportStage } from "./providerUsageReport.ts";

// report-estimated-cost (JOS-227), design Decisions 2–4 — R2 of the admin reports catalogue: billed units of R1 times the
// current price per unit of each provider profile, with totals per currency.

export interface EstimatedCostRow {
  stage: ReportStage;
  providerId: string;
  providerLabel: string;
  unit: string;
  billedUnits: number;
  failedUnits: number;
  pricePerUnit: number | null;
  currency: string | null;
  estimatedCost: number | null;
}

export interface CurrencyTotal {
  currency: string;
  estimatedCost: number;
}

export interface EstimatedCostReport {
  from: string | null;
  to: string;
  sceneAttemptsFollowCurrentProvider: boolean;
  rows: EstimatedCostRow[];
  totals: CurrencyTotal[];
  totalsExcludeUnpriced: boolean;
}

export interface ProviderPricing {
  label: string;
  price: { pricePerUnit: number; currency: string } | null;
}

const PRICE = z.object({ pricePerUnit: PRICE_SHAPE.pricePerUnit.unwrap(), priceCurrency: PRICE_SHAPE.priceCurrency.unwrap() });

/** The label and current price of every provider profile; an id missing from the map has no profile and is unpriced. */
export function providerPricing(): Map<string, ProviderPricing> {
  const profiles = db.prepare("SELECT id, label, parameters FROM provider_profiles").all() as unknown as { id: string; label: string; parameters: string }[];
  return new Map(
    profiles.map((profile) => {
      const parsed = PRICE.safeParse(JSON.parse(profile.parameters));
      return [profile.id, { label: profile.label, price: parsed.success ? { pricePerUnit: parsed.data.pricePerUnit, currency: parsed.data.priceCurrency } : null }];
    }),
  );
}

/** Sums the amounts per currency, ordered by currency code. */
export function totalsPerCurrency(amounts: readonly { currency: string; estimatedCost: number }[]): CurrencyTotal[] {
  const totals = new Map<string, number>();
  for (const amount of amounts) totals.set(amount.currency, (totals.get(amount.currency) ?? 0) + amount.estimatedCost);
  return [...totals].sort(([a], [b]) => a.localeCompare(b)).map(([currency, estimatedCost]) => ({ currency, estimatedCost }));
}

/** Estimated cost per stage and provider for the attempts sent in `[from, to)` (`from` absent: from the beginning). */
export function estimatedCostReport(period: { from?: string; to: string }): EstimatedCostReport {
  const from = period.from ?? null;
  const pricing = providerPricing();
  const groups = new Map<string, CountedAttempt[]>();
  for (const attempt of countedAttempts(from, period.to)) {
    const key = `${attempt.stage}\u0000${attempt.providerId}`;
    groups.set(key, [...(groups.get(key) ?? []), attempt]);
  }

  const rows = [...groups.values()].map((attempts): EstimatedCostRow => {
    const first = attempts[0]!;
    const profile = pricing.get(first.providerId);
    const price = profile?.price ?? null;
    const unitsOf = (success: boolean) => attempts.filter((attempt) => (attempt.outcome === "success") === success).reduce((total, attempt) => total + attempt.units, 0);
    const billedUnits = unitsOf(true);
    return {
      stage: first.stage,
      providerId: first.providerId,
      providerLabel: profile?.label ?? first.providerId,
      unit: first.unit,
      billedUnits,
      failedUnits: unitsOf(false),
      pricePerUnit: price?.pricePerUnit ?? null,
      currency: price?.currency ?? null,
      estimatedCost: price ? billedUnits * price.pricePerUnit : null,
    };
  });

  rows.sort((a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage) || a.providerLabel.localeCompare(b.providerLabel));
  return {
    from,
    to: period.to,
    sceneAttemptsFollowCurrentProvider: true,
    rows,
    totals: totalsPerCurrency(rows.flatMap((row) => (row.currency !== null && row.estimatedCost !== null ? [{ currency: row.currency, estimatedCost: row.estimatedCost }] : []))),
    totalsExcludeUnpriced: rows.some((row) => row.estimatedCost === null),
  };
}

export interface SessionCost {
  estimatedCost: CurrencyTotal[];
  excludesUnpricedProvider: boolean;
}

/** Design Decision 5 — the estimated cost of each session over all its successful attempts, keyed by run id. */
export function sessionCosts(runIds: readonly string[]): Map<string, SessionCost> {
  const pricing = providerPricing();
  const successes = new Map<string, CountedAttempt[]>(runIds.map((runId) => [runId, []]));
  for (const attempt of countedAttemptsOfRuns(runIds)) if (attempt.outcome === "success") successes.get(attempt.runId)!.push(attempt);
  return new Map(
    [...successes].map(([runId, attempts]) => {
      const amounts = attempts.flatMap((attempt) => {
        const price = pricing.get(attempt.providerId)?.price;
        return price ? [{ currency: price.currency, estimatedCost: attempt.units * price.pricePerUnit }] : [];
      });
      return [runId, { estimatedCost: totalsPerCurrency(amounts), excludesUnpricedProvider: amounts.length < attempts.length }];
    }),
  );
}
