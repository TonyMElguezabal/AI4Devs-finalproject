# Step 8 Report - E2E in the browser

- Date: 2026-10-26
- Change: use-reference-image-in-generation (JOS-202)
- Agent: Claude Sonnet 5.5 (Chrome automation; the Playwright MCP is not installed in this environment)

## Setup
Backend on port 3100 and the Vite dev server on 5173, the backend on a throwaway `DB_PATH`, `PROJECTS_ROOT` and `PROVIDER_KEY_PATH`, a test `ADMIN_PASSWORD`, and `USE_STUB_VOICE_PROVIDER=hang` (no provider billed).

## Scenarios
1. Open `/admin`, unlock with the test password. The Visual style section loads.
2. Upload the Warry WebP in "Reference image". The preview renders and the help text reads "It is sent to the image provider with every scene of sessions created afterwards." (the old "not sent yet" text is gone).
3. Open `/`, decline the optional telemetry prompt ("Not now"), fill title, script and language, press "Start project". The session page opens in the voice-over phase, "Voice-over: Stub provider (stub-voice), 1 attempt" (held by the stub).
4. Server-side check after the UI run: the run row has `reference-image.webp`, `image/webp` and a SHA-256 starting `35c81e441a9c`, and the project folder holds `reference-image.webp` and `script.txt`.

## Cleanup
Servers stopped (ports 3100 and 5173 free), browser tab closed, throwaway data removed; `backend/data` unchanged.

## Outcome
- Step 8 status: PASS
- Not covered: an error state for a rejected reference (adapter tests) and the image request itself (task 9.1).
