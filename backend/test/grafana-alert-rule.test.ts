import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// alert-unresponsive-provider (JOS-258), design Decisions 4 and 5 — the alert rule and the dashboards are imported
// by hand, so this test is what keeps their query, threshold and routing from drifting from the spec.

const GRAFANA = join(import.meta.dirname, "../../infra/grafana");
const readJson = (relative: string) => JSON.parse(readFileSync(join(GRAFANA, relative), "utf8"));

const rule = readJson("alerts/unresponsive-provider.json");
const QUERY =
  'sum by (provider, stage) (increase(vid4you_provider_calls_total{outcome="unresponsive", deployment_environment!="development"}[5m])) >= 3';

describe("the unresponsive-provider alert rule", () => {
  it("counts unresponsive calls per provider and stage over 5 minutes, at 3 or more, outside development", () => {
    const query = rule.data.find((step: { refId: string }) => step.refId === "A");
    expect(query.model.expr).toBe(QUERY);
    expect(query.relativeTimeRange).toEqual({ from: 300, to: 0 });
  });

  it("fires as soon as the condition holds, is critical, and treats no data as OK", () => {
    expect(rule.for).toBe("0s");
    expect(rule.labels).toMatchObject({ severity: "critical" });
    expect(rule.noDataState).toBe("OK");
    expect(rule.data.map((step: { refId: string }) => step.refId)).toContain(rule.condition);
  });

  it("names the provider and the stage in its summary", () => {
    expect(rule.annotations.summary).toContain("{{ $labels.provider }}");
    expect(rule.annotations.summary).toContain("{{ $labels.stage }}");
  });

  it("routes to the contact point vid4you-critical by name", () => {
    expect(rule.notification_settings).toEqual({ receiver: "vid4you-critical" });
  });
});

describe("the providers dashboard", () => {
  const exprs = (JSON.stringify(readJson("dashboards/providers.json")).match(/"expr":"(?:[^"\\]|\\.)*"/g) ?? []).join("\n");

  it("counts unresponsive calls in the retry rate, and no other query filters on transient alone", () => {
    expect(exprs).toContain('outcome=~\\"transient|unresponsive\\"');
    expect(exprs).not.toContain('outcome=\\"transient\\"');
  });
});

describe("the Grafana folder", () => {
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => (statSync(join(dir, name)).isDirectory() ? files(join(dir, name)) : [join(dir, name)]));

  it("contains no email address: the contact point's address lives only in Grafana Cloud", () => {
    for (const file of files(GRAFANA)) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
    }
  });
});
