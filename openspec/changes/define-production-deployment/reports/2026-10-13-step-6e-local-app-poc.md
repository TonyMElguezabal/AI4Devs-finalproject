# Step 6E — local packaged application, macOS (Decision 14)

Date: 2026-10-13. Machine: Apple M1 Max, macOS, 32 GB. Build: `node openspec/changes/define-production-deployment/poc/local/build.mjs` (repository root).

## What was built
| Piece | How | Size |
|---|---|---|
| `Vid4You` | Node 26.4.0 single executable application (`--build-sea`), built from the **official** Node release binary (Homebrew's `node` has no SEA fuse; the archive is checksum-verified against `SHASUMS256.txt`), ad-hoc signed with `codesign -s -` | 146 MB (the Node runtime is ~140 MB) |
| embedded assets | the frontend built with `VITE_API_BASE=""` (same origin), 3 files read through `node:sea` | 164 KB |
| `vid4you.cjs` (inside) | esbuild bundle of `poc/local/entry.ts` + the backend, CommonJS | 2.4 MB |
| `ffmpeg`, `ffprobe` beside it | static builds from npm (`ffmpeg-static@5.2.0`, `ffprobe-static@3.1.0`); `otool -L` shows system libraries only | 46 MB + 77 MB |

## Stand-ins (each one is a follow-up story)
| Stand-in in `poc/local/` | Story |
|---|---|
| `entry.ts` repeats `server.ts`'s bootstrap; the bundle cuts `server.ts` at its own bootstrap (entry check fails in a bundle and on Windows, top-level await) | L1 |
| `env.ts` sets `DB_PATH`, `PROJECTS_ROOT` to the data folder and points the credentials lookup at `<data>/.secrets.json` through a define of `import.meta.dirname` | L2 |
| `entry.ts` puts an `Origin`/`Host` guard and the static files in front of Fastify's request handler | L3 |
| `entry.ts` probes `/health` on the port before starting and opens the running instance | L4 |
| `env.ts` deletes `ALLOW_TEST_ENDPOINTS` and `USE_STUB_*` unless started in PoC stub mode; `@fastify/swagger-ui` replaced by a no-op | L5 |
| `env.ts` maps `/opt/homebrew/bin/ffmpeg`, `ffmpeg` and `ffprobe` to the bundled binaries (incl. `execFile`'s promisified form) | S2 |
| `entry.ts` calls `setAssemblyTool(createFfmpegAssemblyTool())` | S1 |
| stub providers and `quick-scene` for the stubbed session (decomposition hand-off not wired) | S6 |

## Results (run with `env -i PATH=/usr/bin:/bin`, so nothing from Homebrew is reachable)
| Task | Check | Result |
|---|---|---|
| 6.16 | start | healthy in under a second; store and projects created in the data folder; page `200 text/html` |
| 6.17 | stubbed session | `final-video`; download `200`, 58,339 B, h264 1920x1080 + mp3, 1.0 s; project folder holds script, MP3, timestamps, image, clip, final MP4 |
| 6.17 | `kill -9` five seconds into the video stage, relaunch | healthy again in under a second; boot log `stillPending: 1`; the session finished, download `200` |
| 6.18 | today's code (`node src/server.ts`), request with `Origin: https://evil.example` | `200` with `access-control-allow-origin: https://evil.example` (read allowed); SSE echoes it too; `Host: evil.example` accepted |
| 6.18 | packaged executable, same requests | `403` for cross-origin read, cross-origin `POST /sessions`, cross-origin SSE and a rebinding `Host`; the app's own origin and plain navigation `200` |
| 6.19 | second launch while running | prints "already running; opening it", exits 0; one process |

## Not done here
- Windows (task 6.20) — the product owner tests the `.exe` on a laptop as the last step.
- Real providers inside the executable (credentials file in the data folder) — needs keys.
- Size: about 270 MB on disk with ffmpeg/ffprobe; a compressed archive or a shared ffmpeg is a packaging-story choice.
