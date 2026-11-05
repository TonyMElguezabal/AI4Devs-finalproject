# Step 10 Report - E2E Testing in the Browser

- Date: 2026-10-28
- Change: rebuild-scene (JOS-235)
- Agent: Claude (Sonnet 5.5)

Setup: backend from this worktree on `PORT=3235` (scratch `DB_PATH` and `PROJECTS_ROOT`, `CORS_ALLOWED_ORIGINS` for the page's origin, `USE_STUB_IMAGE_PROVIDER=success`, `USE_STUB_VIDEO_PROVIDER` `success` or `pending`, `USE_STUB_ASSEMBLY_TOOL=slow-success` with a 6 s delay), and the worktree's Vite on port 5174 with `VITE_API_BASE` pointing at it (port 5173 was taken by another Vite from the main checkout, which was left alone). Session `…FB2`, two complete scenes, final video version 1, seeded as in step 9. The telemetry prompt was declined ("Not now").

## 10.1 Rebuild scene, live
- Expanded scene 1: **Rebuild scene 1** is offered. It opens an inline form with the IMAGE and VIDEO instructions prefilled, and the sentence "The image and the clip are generated again by the providers, which costs one request each. The rest of the session is kept and the final video is then rebuilt."
- Edited IMAGE and chose **Rebuild image and clip**. Without any further action: the details showed the new IMAGE; the session state became "Assembling final video" with the Final video card "In progress", **Download final video** and **Version 1** kept; the scene's **Rebuild scene** button was gone while the assembly ran.
- Six seconds later: "Final video ready", **Version 2**, and the button was back. The scene's image URL was `…/image?r=1`, and its two download URLs ended in `?r=1`.

## 10.2 Where the action is absent
- With a clip that never finishes, scene 2 was rebuilt from the page: it showed "Generating clip" and its details held no Rebuild scene button, only "Show the request sent". Scene 1 (complete) kept its button while scene 2 generated.
- **Found and fixed:** the Final video card still offered "Rebuild final video" while scene 2 was generating, a request the backend refuses (`scenes-not-complete`). Artifacts were updated first, then a test, then `SessionPage` passes the handler only while every scene is complete (tasks 6.1a-6.2a). After a reload the card showed only "Download final video" and "Version 2".
- Not exercised in the browser: the refusal sentences of Rebuild scene. With the live stream the form closes as soon as the scene leaves a rebuildable state, so a refusal cannot be reached by clicking; the two sentences are covered by `scene-rebuild.test.tsx` and the 409 reasons by step 9.

## 10.3 375 px
- Measured in a same-origin iframe of exactly 375 px (resizing the window does not change the viewport here). The only element past the right edge was the top bar's "New project" button, the known pre-existing overflow (not from this change).
- **Found and fixed:** the scene details grid has a 17 rem minimum column that is wider than the card at 375 px. It already clipped the PROMPT/IMAGE/VIDEO rows and the diagnostics, and clipped the open form's text and fields at the right (info column 27 px wider than its card). The minimum is now `min(17rem, 100%)` (task 6.2b). After the change the info column, the form and the textarea all end inside the card, and the rows and the sentence wrap. Screenshots: `/var/folders/7g/g5k67xxn1rb5m8gfntyyxbn80000gn/T/claude-chrome-screenshots-OsFzeq/screenshot-1793205756019-19.jpg` (before) and `…/screenshot-1793205799956-20.jpg` (after); the form at full width: `…/screenshot-1793205620324-18.jpg`.

## Environment restored
- Stopped the backend (3235) and my Vite (5174) by port; the Vite on 5173 was not touched. Closed the browser tab. Deleted the scratch database and project folders. No `backend/data/` was created.

Outcome: PASS
