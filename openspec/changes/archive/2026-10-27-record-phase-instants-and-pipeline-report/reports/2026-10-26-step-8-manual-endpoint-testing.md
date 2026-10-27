# Step 8 Report - Manual Endpoint Testing (JOS-228)

Real server on a scratch store outside the repo (port 3228, `ADMIN_PASSWORD` a test value). `POST /sessions` needs the script-moderation key, so the stub launcher of the JOS-175 spike (`openspec/changes/define-admin-reports/poc/launch.ts`: the real server and routes with stub providers) ran the session.

## 8.1 Upgrade
Store at migration 21 holding one session (`old-1`), started with this branch: `schema_migrations` max version 22, `phase_instants` exists with 0 rows, `runs` unchanged.

## 8.2 Old session (AC2)
`GET /admin/reports/pipeline-time` (Bearer test password): `200`, every phase `sessions: 0`, median and 95th percentile `null`, `sessions: []`. `old-1` is not listed and has no estimated time.

## 8.3 Session end to end (AC1, AC3)
`POST /sessions` then `POST /sessions/{id}/continue`; state reached `final-video`. `phase_instants` for the session:

| phase | started_at | ended_at |
|---|---|---|
| voice-over | 15:22:59.889 | 15:22:59.985 |
| decomposition | 15:22:59.987 | 15:23:00.060 |
| scenes | 15:23:00.060 | 15:23:00.140 |
| assembly | 15:23:00.141 | 15:23:00.143 |

The scenes start equals the decomposition end. The report gave per-session seconds (0.096, 0.073, 0.08, 0.002) and aggregates; the scenes row gave `timedOut`, `finishedLate` and `superseded` as `null`; the other counts were 0. A first session with a script too long for the stub alignment failed in decomposition: its report row shows voice-over 0.077 s and no time for the later phases (a phase with a start and no end).

## 8.4 Refusals (AC4)
- No `Authorization` header: `401`
- Wrong password: `401`
- `from` after `to`: `400`

## Cleanup
Servers stopped (by port); scratch store, projects folder and scripts discarded.

## Outcome
- Step 8 status: PASS
