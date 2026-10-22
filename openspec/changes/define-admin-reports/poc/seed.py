#!/usr/bin/env python3
"""Throwaway driver for the reports spike (JOS-175, task 2.1): runs sessions against poc/launch.ts so the scratch store holds
a known mix of successes, recovered failures, exhausted retries, a not-retryable failure, a provider switch and a rebinding
(what a JOS-172 move does), then shifts timestamps so the sessions fall on different days. Usage: seed.py SCRATCH_DIR PORT"""
import json, sqlite3, sys, time, urllib.request

DIR, PORT = sys.argv[1], sys.argv[2]
BASE = f"http://127.0.0.1:{PORT}"
SCRIPT = "The harbor is quiet at dusk. Fishing boats return with the tide."

def http(method, path, body=None, admin=False):
    req = urllib.request.Request(BASE + path, method=method, data=json.dumps(body).encode() if body is not None else None)
    if body is not None: req.add_header("Content-Type", "application/json")
    if admin: req.add_header("Authorization", "Bearer seed-admin-pw")
    try:
        with urllib.request.urlopen(req) as r: return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")

def mode(**kw): open(DIR + "/mode.json", "w").write(json.dumps(kw))
def db(): return sqlite3.connect(DIR + "/store.sqlite")
def session(title):
    status, body = http("POST", "/sessions", {"title": title, "script": SCRIPT, "language": "en"})
    assert status == 201, (status, body)
    return body["session"]["sessionId"]
def wait(seconds): time.sleep(seconds)

mode()
session("S1 clean on stub-a"); wait(16)
mode(voice="fail-once"); session("S2 voice recovers"); wait(18)
mode(voice="fail"); s3 = session("S3 voice exhausted then retried"); wait(14)
mode(); print("retry voice", http("POST", f"/sessions/{s3}/voice-over/retry")[0]); wait(16)
mode(voice="hard"); session("S4 voice not retryable"); wait(6)
mode(image="fail-once"); session("S5 image recovers"); wait(18)
mode(video="fail"); s6 = session("S6 clip exhausted then rebound and retried"); wait(18)
c = db()
c.execute("UPDATE scenes SET video_provider = 'stub-b' WHERE run_id = ? AND status = 'failed'", (s6,)); c.commit()  # what a JOS-172 move does
ids = [r[0] for r in c.execute("SELECT id FROM scenes WHERE run_id = ?", (s6,))]
mode()
for sid in ids: print("retry scene", http("POST", f"/sessions/{s6}/scenes/{sid}/retry")[0])
wait(14)
for stage in ("reasoning", "voice", "alignment", "image", "video"):
    print("activate", stage, http("PUT", f"/admin/providers/{stage}", {"providerId": "stub-b"}, admin=True)[0])
session("S7 clean on stub-b"); wait(16)

# The scratch store only: the narration records are locked against updates, so their triggers are dropped here to shift their dates.
c.execute("DROP TRIGGER IF EXISTS voice_overs_no_update"); c.execute("DROP TRIGGER IF EXISTS narration_timestamps_no_update")
# Spread the sessions over calendar days: shift every timestamp of a session back by N days.
SHIFT = {"S1 clean on stub-a": 40, "S2 voice recovers": 40, "S3 voice exhausted then retried": 20, "S4 voice not retryable": 20, "S5 image recovers": 5, "S6 clip exhausted then rebound and retried": 5}
def shifted(col, days): return f"strftime('%Y-%m-%dT%H:%M:%fZ', {col}, '-{days} days')"
for title, days in SHIFT.items():
    run = c.execute("SELECT id FROM runs WHERE title = ?", (title,)).fetchone()[0]
    c.execute(f"UPDATE runs SET created_at = {shifted('created_at', days)} WHERE id = ?", (run,))
    for col in ("queued_at", "sent_at", "due_at", "finished_at", "late_result_at"):
        c.execute(f"UPDATE stage_attempts SET {col} = {shifted(col, days)} WHERE run_id = ? AND {col} IS NOT NULL", (run,))
    c.execute(f"UPDATE provider_requests SET sent_at = {shifted('sent_at', days)} WHERE scene_id IN (SELECT id FROM scenes WHERE run_id = ?)", (run,))
    for table in ("scene_results", "scene_video_results"):
        c.execute(f"UPDATE {table} SET committed_at = {shifted('committed_at', days)} WHERE scene_id IN (SELECT id FROM scenes WHERE run_id = ?)", (run,))
    c.execute(f"UPDATE scenes SET updated_at = {shifted('updated_at', days)} WHERE run_id = ?", (run,))
    c.execute(f"UPDATE voice_overs SET completed_at = {shifted('completed_at', days)} WHERE run_id = ?", (run,))
    c.execute(f"UPDATE narration_timestamps SET obtained_at = {shifted('obtained_at', days)} WHERE run_id = ?", (run,))
    c.execute(f"UPDATE final_video_builds SET created_at = {shifted('created_at', days)} WHERE run_id = ?", (run,))
c.commit()
print("done")
