import { db } from "./db.ts";

// record-provider-changes (JOS-229), design Decision 4 — the provider-change log in a period, newest first.
// Only ids, display names as logged, the session title and the scene number are read: no script, prompt, key or failure text.

export interface ProviderChangeRow {
  changedAt: string;
  kind: "active-provider" | "failed-stage-move";
  stage: "reasoning" | "voice" | "alignment" | "image" | "video";
  sessionId: string | null;
  sessionTitle: string | null;
  sceneNumber: number | null;
  previousProviderId: string;
  previousProviderLabel: string;
  newProviderId: string;
  newProviderLabel: string;
}

export interface ProviderChangesReport {
  from: string | null;
  to: string;
  entries: ProviderChangeRow[];
}

export function providerChangesReport({ from, to }: { from?: string; to: string }): ProviderChangesReport {
  const entries = db
    .prepare(
      `SELECT c.changed_at AS changedAt, c.kind, c.stage, c.run_id AS sessionId, r.title AS sessionTitle, s.idx AS sceneNumber,
              c.previous_provider_id AS previousProviderId, c.previous_provider_label AS previousProviderLabel,
              c.new_provider_id AS newProviderId, c.new_provider_label AS newProviderLabel
         FROM provider_changes c
         LEFT JOIN runs r ON r.id = c.run_id
         LEFT JOIN scenes s ON s.id = c.scene_id
        WHERE (? IS NULL OR c.changed_at >= ?) AND c.changed_at < ?
        ORDER BY c.changed_at DESC, c.id DESC`,
    )
    .all(from ?? null, from ?? null, to) as unknown as ProviderChangeRow[];
  return { from: from ?? null, to, entries };
}
