import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EstimatedCostTable } from "../src/components/EstimatedCostTable";
import type { EstimatedCostReport, EstimatedCostRow } from "../src/types";

// report-estimated-cost (JOS-227), task 6.1 — design Decision 6.

const voiceRow: EstimatedCostRow = { stage: "voice", providerId: "voice-a", providerLabel: "Voice A", unit: "voice_characters", billedUnits: 12345, failedUnits: 40, pricePerUnit: 0.00003, currency: "USD", estimatedCost: 0.37035 };
const clipRow: EstimatedCostRow = { stage: "video", providerId: "vid-b", providerLabel: "Vid B", unit: "clip_seconds", billedUnits: 34, failedUnits: 10, pricePerUnit: 0.05, currency: "EUR", estimatedCost: 1.7 };
const imageRow: EstimatedCostRow = { stage: "image", providerId: "img-a", providerLabel: "Image A", unit: "images", billedUnits: 12, failedUnits: 0, pricePerUnit: null, currency: null, estimatedCost: null };

const reportOf = (rows: EstimatedCostRow[], totals: EstimatedCostReport["totals"], totalsExcludeUnpriced: boolean): EstimatedCostReport => ({ from: null, to: "2026-10-22T12:00:00.000Z", sceneAttemptsFollowCurrentProvider: true, rows, totals, totalsExcludeUnpriced });

const cellTexts = (row: HTMLElement) => within(row).getAllByRole("cell").map((cell) => cell.textContent);

describe("EstimatedCostTable", () => {
  it("shows each row with units, price and an amount in its currency, and 'Unpriced' when there is no price", () => {
    render(<EstimatedCostTable report={reportOf([voiceRow, imageRow, clipRow], [{ currency: "EUR", estimatedCost: 1.7 }, { currency: "USD", estimatedCost: 0.37035 }], true)} />);

    const table = screen.getByRole("table", { name: /Estimated cost/ });
    expect(within(table).getAllByRole("columnheader").map((header) => header.textContent)).toEqual(["Stage", "Provider", "Billed units", "Failed units (not priced)", "Price per unit", "Estimated cost"]);
    const rows = within(within(table).getAllByRole("rowgroup")[1]!).getAllByRole("row");
    expect(cellTexts(rows[0]!)).toEqual(["Voice", "Voice A", "12,345 characters", "40 characters", "0.00003 USD", "USD 0.37"]);
    expect(cellTexts(rows[1]!)).toEqual(["Image", "Image A", "12 images", "0 images", "Unpriced", "Unpriced"]);
    expect(cellTexts(rows[2]!)).toEqual(["Video", "Vid B", "34 clip seconds", "10 clip seconds", "0.05 EUR", "EUR 1.70"]);
  });

  it("labels every amount an estimate with its currency, in the caption and the accessible names", () => {
    render(<EstimatedCostTable report={reportOf([clipRow], [{ currency: "EUR", estimatedCost: 1.7 }], false)} />);

    const table = screen.getByRole("table", { name: /estimate/i });
    expect(within(table).getByRole("cell", { name: "Estimated cost of Vid B: EUR 1.70 (estimate)" })).toBeInTheDocument();
    expect(within(table).getByRole("cell", { name: "Total in EUR: EUR 1.70 (estimate)" })).toBeInTheDocument();
  });

  it("gives one total line per currency and the exclusion note only when flagged", () => {
    const { rerender } = render(<EstimatedCostTable report={reportOf([voiceRow, imageRow, clipRow], [{ currency: "EUR", estimatedCost: 1.7 }, { currency: "USD", estimatedCost: 0.37035 }], true)} />);
    const footer = within(screen.getByRole("table", { name: /Estimated cost/ })).getAllByRole("rowgroup")[2]!;
    expect(within(footer).getAllByRole("row").map(cellTexts)).toEqual([
      ["Total in EUR", "EUR 1.70"],
      ["Total in USD", "USD 0.37"],
    ]);
    expect(screen.getByText("The totals exclude unpriced providers.")).toBeInTheDocument();

    rerender(<EstimatedCostTable report={reportOf([clipRow], [{ currency: "EUR", estimatedCost: 1.7 }], false)} />);
    expect(screen.queryByText("The totals exclude unpriced providers.")).not.toBeInTheDocument();
  });

  it("says failed attempts are shown but not priced", () => {
    render(<EstimatedCostTable report={reportOf([clipRow], [{ currency: "EUR", estimatedCost: 1.7 }], false)} />);
    expect(screen.getByText(/Failed units are shown but not priced/)).toBeInTheDocument();
  });

  it("shows nothing for an empty period, where the usage report already says there was no activity", () => {
    const { container } = render(<EstimatedCostTable report={reportOf([], [], false)} />);
    expect(container).toBeEmptyDOMElement();
  });
});
