# Step 9 Report - Browser E2E of `/admin`

- Date: 2026-10-19
- Change: admin-visual-style-prompt (JOS-201)
- Agent: Claude Sonnet 5.5
- Tool: the Chrome browser extension (the Playwright MCP is not installed in this environment), driving the real page.

## Environment
- Vite dev server on `127.0.0.1:5173` with `VITE_API_BASE=http://127.0.0.1:3199`, and the real backend (`buildApp()`) on 3199 with a throwaway `DB_PATH` and `PROJECTS_ROOT`. Only the moderator and the voice provider were stubbed (no keys in this worktree).
- Hitting `/admin` directly on the Vite server answers the app shell (200).

## Scenarios and outcomes
1. **Admin link**: the start page's top bar shows an "Admin" link (`href="/admin"`); clicking it opens the admin page, whose top bar shows "Projects". PASS.
2. **Save the prompt**: typed the "Warry" prompt, clicked Save prompt; "Prompt saved." appeared and the counter read 85 / 8000. After a full reload the textarea held the same text. PASS.
3. **Upload an image**: uploaded a 69-byte PNG through the file input; the preview appeared. After a reload the preview was still shown and had decoded (`naturalWidth` 1), and "Remove image" was present. PASS.
4. **Unsupported file**: uploading a GIF showed "Choose a PNG, JPEG or WebP image." and left the stored preview in place. PASS.
5. **Over the limit**: a prompt of 8,001 characters showed "8001 / 8000" and the Save prompt button was disabled. PASS.
6. **Backend stopped during a save**: with the backend killed, Save prompt showed "Failed to fetch" and the typed text stayed in the textarea (screenshot `2026-10-19-step-9-e2e-error-state.jpg`). PASS.
7. **Remove the image**: after restarting the backend on the same database, "Remove image" showed "Image removed.", the preview disappeared, the prompt was untouched, and a reload still showed no preview. PASS.

The start page also showed the existing privacy prompt on first load; it was dismissed with "Not now" and is not part of this change.

## Restoration
- Both servers were stopped, the browser tab was closed, and the throwaway database and its `admin/` image directory were deleted. `backend/data/skeleton.sqlite` was never used by this step.

## Outcome
- Step 9 status: PASS
- Blocking issues: none
