# Step 7 Report - Manual Endpoint Testing with curl

- Date: 2026-10-26
- Change: use-reference-image-in-generation (JOS-202)
- Agent: Claude Sonnet 5.5

## Why no Fal stand-in
The Fal host is fixed inside the adapter by design (no setting can name a host), so a local stand-in cannot receive the Fal request. The request URL, body and the rejection reason are asserted by the adapter tests with a stubbed `fetch`. This step covers everything reachable over HTTP. The voice stage was held with `USE_STUB_VOICE_PROVIDER=hang`, so no provider was billed.

## Setup
`DB_PATH`, `PROJECTS_ROOT` and `PROVIDER_KEY_PATH` in a throwaway folder, `ADMIN_PASSWORD=curl-test-pass`, `PORT=3198`, `USE_STUB_VOICE_PROVIDER=hang`, started with `node src/server.ts`. Reference image: the Warry WebP (195,324 bytes, SHA-256 `35c81e44...c3aac`).

## Commands and results
| # | Request | Result |
|---|---|---|
| 1 | `GET /health` | `{"ok":true}` |
| 2 | `POST /sessions` `{"title":"No reference",...}` (no admin image) | 201-style session body, state `submitted` |
| 3 | `PUT /admin/settings/reference-image` (`image/webp`, the Warry file) | 200; `GET /admin/settings` shows `referenceImage` with type `image/webp` and 195,324 bytes |
| 4 | `POST /sessions` `{"title":"With reference",...}` | session created |
| 5 | `PUT /admin/settings/reference-image` (`image/png`, a 4.9 MB PNG) | 200 (replaced) |
| 6 | `DELETE /admin/settings/reference-image` | 204; `GET /admin/settings` shows `referenceImage: null` |

## Verification
- Run rows (`sqlite3`): "No reference" has null `reference_image_path`, `reference_image_content_type` and `reference_image_sha256`; "With reference" has `reference-image.webp`, `image/webp` and `35c81e44...c3aac`, equal to `shasum -a 256` of the uploaded file.
- Project folders: "No reference ..." holds only `script.txt`; "With reference ..." holds `reference-image.webp` and `script.txt`; `cmp` reports the snapshot byte-identical to the uploaded file, checked after steps 5 and 6 (the replacement and the deletion left it unchanged).
- `GET /sessions/{id}` is 746 bytes and contains neither `base64` nor `data:image`; `GET /admin/settings` returns only `visualStylePrompt`, `referenceImage` (type, size, time) and `updatedAt`.

## Cleanup
Server stopped (port 3198 free), throwaway data removed from the scratch folder, `backend/data` unchanged (no `skeleton.sqlite`, empty `projects/`).

## Outcome
- Step 7 status: PASS
- Not covered here, by design: the Fal request itself (adapter tests) and a real Fal call (task 9.1).
