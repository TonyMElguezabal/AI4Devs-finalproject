# Step 6 Report - Manual endpoint testing with curl (JOS-193)

Real server on a scratch store and projects folder (`DB_PATH=/tmp/jos193/db.sqlite`, `PROJECTS_ROOT=/tmp/jos193/projects`, port 3194), `ALLOW_TEST_ENDPOINTS=1`, `USE_STUB_VIDEO_PROVIDER=success-bytes`, `USE_STUB_ASSEMBLY_TOOL=success`.

## Setup notes
- `POST /sessions` needs the script moderation provider (an OpenAI key). Instead of using a key, a scratch launcher outside the repo installed an always-clean moderator and then ran the real `server.ts` bootstrap. No repository code was changed for this.
- Port 3100 was already held by a running Vid4You app, so the scratch server used 3194. Nothing was sent to the app on 3100 on purpose, but an earlier attempt of the session-creation script did target 3100 before this was noticed; that app did not answer, and the attempt was stopped.
- As in JOS-164, the bare stub assembly tool writes no bytes, so a 12-byte MP4 header was placed at each project's recorded path, as a real ffmpeg run would have left it.

## 6.2-6.3 Downloads (all 200, `content-type: video/mp4`, `content-length: 12`)
| Title | Content-Disposition |
|---|---|
| `Summer Trip` | `attachment; filename="Summer Trip.mp4"; filename*=UTF-8''Summer%20Trip.mp4` |
| `Café de la plage 海` | `attachment; filename="Caf_ de la plage _.mp4"; filename*=UTF-8''Caf%C3%A9%20de%20la%20plage%20%E6%B5%B7.mp4` |
| `a/b\c:d` | `attachment; filename="a_b_c_d.mp4"; filename*=UTF-8''a_b_c_d.mp4` |
| `con` | `attachment; filename="_con.mp4"; filename*=UTF-8''_con.mp4` |

`curl -OJ` on the non-ASCII session saved `Caf_ de la plage _.mp4` (curl uses the ASCII `filename` and ignores `filename*`), and `cmp` against the project folder's file was byte-identical.

## 6.4 Unchanged refusals
- Session with no final video yet: `409 {"ok":false,"reason":"final video is not yet available"}`
- Unknown but well-formed session id: `404 {"ok":false,"reason":"unknown session"}` (a malformed id gives 400 from the id pattern, as before)

## 6.5 Contract
`GET /docs/json` for the route: 200 content is `video/mp4`, and the route description carries the naming rule.

## Cleanup
Servers stopped, `/tmp/jos193` removed, `backend/data` absent. The default store was never touched.

## Outcome
- Step 6 status: PASS
