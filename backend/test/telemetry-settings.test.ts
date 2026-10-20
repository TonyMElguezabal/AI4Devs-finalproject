import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { db, getTelemetrySettings, saveTelemetryConsent } from "../src/db.ts";

// add-observability-telemetry (JOS-199), group 2 — Decision 3: consent lives in the store, one row, all off.
// The migration runs when db.ts loads; each test puts the single row back to its fresh state.
beforeEach(() => {
  db.exec("UPDATE telemetry_settings SET errors = 0, provider_usage = 0, product_usage = 0, answered_at = NULL");
});

describe("telemetry settings", () => {
  it("starts with every signal off, unanswered, and an install ID", () => {
    const settings = getTelemetrySettings();
    expect(settings).toMatchObject({ errors: false, providerUsage: false, productUsage: false, answered: false });
    expect(settings.installId).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it("keeps the install ID stable across reads", () => {
    expect(getTelemetrySettings().installId).toBe(getTelemetrySettings().installId);
  });

  it("persists a saved choice where a second connection to the store sees it", () => {
    const installId = getTelemetrySettings().installId;
    saveTelemetryConsent({ errors: true, providerUsage: false, productUsage: true });

    const reopened = new DatabaseSync(process.env.DB_PATH ?? "data/skeleton.sqlite");
    try {
      expect(getTelemetrySettings(reopened)).toEqual({
        errors: true,
        providerUsage: false,
        productUsage: true,
        answered: true,
        installId,
      });
    } finally {
      reopened.close();
    }
  });
});
