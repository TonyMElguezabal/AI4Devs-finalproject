-- Throwaway queries for the reports spike (JOS-175, task 3.2): each agreed report computed from what the store records today.
-- Run with:  sqlite3 -header -column STORE.sqlite ".parameter set :from '2000-01-01T00:00:00Z'" ".parameter set :to '2100-01-01T00:00:00Z'" ".read queries.sql"
-- Read-only: nothing here writes (the views are TEMP).

-- One row per attempt that reached a provider, from the two places attempts are recorded:
--   * stage_attempts holds the session-level stages (voice-over, timestamps, decomposition) with their provider;
--   * provider_requests holds the scene-level stages (image, video) with NO provider: the scene's binding is used.
-- The `timestamps` attempts that used the voice provider's native timestamps ('elevenlabs-native') call no provider and are left out.
CREATE TEMP VIEW calls AS
  SELECT CASE a.stage WHEN 'voice-over' THEN 'voice' WHEN 'timestamps' THEN 'alignment' ELSE 'reasoning' END AS stage,
         a.provider_id AS provider,
         CASE a.outcome WHEN 'late-success' THEN 'success' ELSE a.outcome END AS outcome,
         CAST((julianday(a.finished_at) - julianday(a.sent_at)) * 86400000 AS INTEGER) AS latency_ms,
         a.sent_at AS at, a.run_id AS run_id, a.attempt_trigger AS trigger, a.error_message AS message,
         CASE a.stage WHEN 'voice-over' THEN 'voice_characters' WHEN 'timestamps' THEN 'audio_seconds' ELSE 'requests' END AS unit,
         CASE a.stage WHEN 'voice-over' THEN (SELECT LENGTH(script) FROM runs r WHERE r.id = a.run_id)
                      WHEN 'timestamps' THEN (SELECT duration_seconds FROM voice_overs v WHERE v.run_id = a.run_id)
                      ELSE 1 END AS units
  FROM stage_attempts a
  WHERE a.stage IN ('voice-over', 'timestamps', 'decomposition') AND a.provider_id IS NOT NULL AND a.provider_id <> 'elevenlabs-native'
    AND a.sent_at IS NOT NULL AND a.outcome IN ('success', 'late-success', 'transient', 'not-retryable', 'timed-out')
  UNION ALL
  SELECT pr.stage,
         CASE pr.stage WHEN 'image' THEN s.provider ELSE s.video_provider END,
         CASE pr.mode WHEN 'success' THEN 'success' WHEN 'transient_failure' THEN 'transient' ELSE 'not-retryable' END,
         pr.latency_ms, pr.sent_at, s.run_id, NULL, NULL,
         CASE pr.stage WHEN 'image' THEN 'images' ELSE 'clip_seconds' END,
         CASE pr.stage WHEN 'image' THEN 1 ELSE s.requested_duration_seconds END
  FROM provider_requests pr JOIN scenes s ON s.id = pr.scene_id
  WHERE pr.mode IN ('success', 'transient_failure', 'not_retryable_failure');

.print
.print == R1 Provider usage (per stage and provider, in the period)
WITH c AS (SELECT * FROM calls WHERE at >= :from AND at < :to),
ranked AS (SELECT stage, provider, latency_ms,
                  ROW_NUMBER() OVER (PARTITION BY stage, provider ORDER BY latency_ms) AS rn,
                  COUNT(*) OVER (PARTITION BY stage, provider) AS n
           FROM c WHERE latency_ms IS NOT NULL)
SELECT c.stage, c.provider,
       COUNT(*) AS attempts,
       SUM(c.outcome = 'success') AS successes,
       SUM(c.outcome = 'transient') AS transient,
       SUM(c.outcome = 'not-retryable') AS not_retryable,
       SUM(c.outcome = 'timed-out') AS timed_out,
       ROUND(100.0 * SUM(c.outcome = 'success') / COUNT(*), 1) AS success_pct,
       (SELECT latency_ms FROM ranked r WHERE r.stage = c.stage AND r.provider = c.provider AND r.rn = (r.n + 1) / 2) AS median_ms,
       (SELECT latency_ms FROM ranked r WHERE r.stage = c.stage AND r.provider = c.provider AND r.rn = CAST((r.n * 95 + 99) / 100 AS INTEGER)) AS p95_ms,
       MAX(c.unit) AS unit,
       SUM(CASE WHEN c.outcome = 'success' THEN c.units END) AS billed_units
FROM c GROUP BY c.stage, c.provider ORDER BY c.stage, c.provider;

.print
.print == R3 Failures and retries
.print -- failed attempts per stage and outcome (both attempt sources)
SELECT stage, outcome, COUNT(*) AS attempts FROM calls WHERE outcome <> 'success' AND at >= :from AND at < :to GROUP BY stage, outcome ORDER BY stage, outcome;
.print -- session-level stages: the application's own failure wording, most frequent first (scene-level messages are not shown: video text can carry the provider's own words)
SELECT stage, message, COUNT(*) AS attempts FROM calls WHERE outcome <> 'success' AND message IS NOT NULL AND at >= :from AND at < :to GROUP BY stage, message ORDER BY attempts DESC;
.print -- session-level stages: cycles whose fourth attempt failed (retry budget exhausted) and manual retries
SELECT CASE stage WHEN 'voice-over' THEN 'voice' WHEN 'timestamps' THEN 'alignment' WHEN 'decomposition' THEN 'reasoning' ELSE stage END AS stage,
       SUM(sequence_in_cycle = 4 AND outcome IN ('transient', 'timed-out')) AS budgets_exhausted,
       SUM(attempt_trigger = 'manual') AS manual_retries
FROM stage_attempts WHERE sent_at >= :from AND sent_at < :to OR (sent_at IS NULL AND queued_at >= :from AND queued_at < :to) GROUP BY stage;
.print -- scene-level stages: scenes that are failed now (a state, not a history: manual retries and exhausted cycles of scenes are not recorded)
SELECT CASE WHEN result IS NULL THEN 'image' ELSE 'video' END AS failed_stage, COUNT(*) AS failed_scenes FROM scenes WHERE status = 'failed' GROUP BY 1;

.print
.print == R4 Sessions (one row per session created in the period)
SELECT substr(r.id, 1, 8) AS id, r.title, r.created_at,
       CASE WHEN r.failure IS NOT NULL THEN 'failed: ' || json_extract(r.failure, '$.phase')
            WHEN EXISTS (SELECT 1 FROM stage_attempts a WHERE a.run_id = r.id AND a.stage = 'assembly' AND a.outcome = 'success') THEN 'final video ready'
            ELSE 'in progress' END AS state,
       (SELECT COUNT(*) FROM scenes s WHERE s.run_id = r.id) AS scenes,
       (SELECT COUNT(*) FROM scenes s WHERE s.run_id = r.id AND s.status = 'failed') AS failed_scenes,
       (SELECT COUNT(*) FROM stage_attempts a WHERE a.run_id = r.id AND a.stage IN ('voice-over', 'timestamps', 'decomposition') AND a.sent_at IS NOT NULL)
         + (SELECT COUNT(*) FROM provider_requests pr JOIN scenes s ON s.id = pr.scene_id WHERE s.run_id = r.id) AS attempts,
       ROUND((julianday((SELECT completed_at FROM voice_overs v WHERE v.run_id = r.id)) - julianday(r.created_at)) * 86400, 1) AS secs_to_voice_over,
       ROUND((julianday((SELECT MAX(finished_at) FROM stage_attempts a WHERE a.run_id = r.id AND a.stage = 'assembly' AND a.outcome = 'success')) - julianday(r.created_at)) * 86400, 1) AS secs_to_final_video
FROM runs r WHERE r.created_at >= :from AND r.created_at < :to ORDER BY r.created_at;
.print -- drill-down: the scenes of the session with the most scenes
SELECT s.idx AS scene, s.status, s.provider AS image_provider, s.video_provider AS clip_provider,
       (SELECT COUNT(*) FROM provider_requests pr WHERE pr.scene_id = s.id AND pr.stage = 'image') AS image_attempts,
       (SELECT COUNT(*) FROM provider_requests pr WHERE pr.scene_id = s.id AND pr.stage = 'video') AS clip_attempts,
       s.requested_duration_seconds AS requested_s, ROUND(s.speed_factor, 3) AS speed_factor, s.duration_warning, s.speed_factor_warning
FROM scenes s WHERE s.run_id = (SELECT run_id FROM scenes GROUP BY run_id ORDER BY COUNT(*) DESC, run_id LIMIT 1) ORDER BY s.idx;

.print
.print == R2 Estimated cost (sketch for the later release): billed units times a price per unit that a provider profile would carry
.print -- no profile has a pricePerUnit parameter yet, so every provider is unpriced, which is what the report must show (never zero)
SELECT c.stage, c.provider, MAX(c.unit) AS unit, SUM(CASE WHEN c.outcome = 'success' THEN c.units END) AS billed_units,
       json_extract(p.parameters, '$.pricePerUnit') AS price_per_unit,
       CASE WHEN json_extract(p.parameters, '$.pricePerUnit') IS NULL THEN 'unpriced'
            ELSE ROUND(SUM(CASE WHEN c.outcome = 'success' THEN c.units END) * json_extract(p.parameters, '$.pricePerUnit'), 4) END AS estimated_cost
FROM calls c LEFT JOIN provider_profiles p ON p.id = c.provider
WHERE c.at >= :from AND c.at < :to GROUP BY c.stage, c.provider ORDER BY c.stage, c.provider;

.print
.print == R6 Pipeline time (sketch for the later release): what the stamps allow today
.print -- voice-over and assembly have a start and an end; decomposition ends at the first image request; the scene phase has no start of its own
SELECT substr(r.id, 1, 8) AS id,
       ROUND((julianday((SELECT completed_at FROM voice_overs v WHERE v.run_id = r.id)) - julianday(r.created_at)) * 86400, 1) AS voice_s,
       ROUND((julianday((SELECT MIN(pr.sent_at) FROM provider_requests pr JOIN scenes s ON s.id = pr.scene_id WHERE s.run_id = r.id AND pr.stage = 'image'))
              - julianday((SELECT completed_at FROM voice_overs v WHERE v.run_id = r.id))) * 86400, 1) AS decomposition_s_approx,
       ROUND((julianday((SELECT MAX(committed_at) FROM scene_video_results sv JOIN scenes s ON s.id = sv.scene_id WHERE s.run_id = r.id))
              - julianday((SELECT MIN(pr.sent_at) FROM provider_requests pr JOIN scenes s ON s.id = pr.scene_id WHERE s.run_id = r.id AND pr.stage = 'image'))) * 86400, 1) AS scenes_s_approx,
       (SELECT COUNT(*) FROM stage_attempts a WHERE a.run_id = r.id AND a.outcome IN ('timed-out', 'late-success', 'superseded')) AS time_limit_hits
FROM runs r ORDER BY r.created_at;

.print
.print == R7 Provider changes (sketch for the later release): the store keeps only the last choice
SELECT stage, provider_id, changed_at FROM active_providers ORDER BY stage;
