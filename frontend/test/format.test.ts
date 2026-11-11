import { describe, expect, it } from "vitest";
import { formatInstant, NOT_RECORDED } from "../src/format";

// admin-tabs-and-tables (JOS-270), task 2.1 — one format for the instants of every report.
describe("report formats", () => {
  it("formats an instant as a medium date and a short time in English", () => {
    const iso = "2026-11-06T12:03:00.000Z";
    expect(formatInstant(iso)).toBe(new Date(iso).toLocaleString("en", { dateStyle: "medium", timeStyle: "short" }));
  });

  it("writes a value that was not recorded as n/a", () => {
    expect(NOT_RECORDED).toBe("n/a");
  });
});
