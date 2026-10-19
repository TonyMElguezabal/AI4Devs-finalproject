# JOS-199 step 13 — browser E2E

Date: 2026-10-18. Chrome (Claude in Chrome) against the packaged executable (`poc/local/out/Vid4You`, this branch) with a fresh throwaway data folder, port 3197, reached through a small local pass-through proxy on 3196 (see 13.4).

| Step | Check | Result |
|---|---|---|
| 13.1 | Fresh store | `telemetry_settings` = `1|0|0|0||<id>`; `GET /telemetry/consent` all false, `answered:false` |
| 13.2 | Load the page | Dialog "Help improve Vid4You" open over the form; three boxes, all unchecked; sentence "Nothing is sent unless you turn it on here. No script, media, file name or key is ever sent. You can change this at any time from Privacy." |
| 13.3 | Tick *error reports* and *usage counts*, Save, reload | Row became `1|0|1` with `answered_at` set; after reload the dialog is closed; **Privacy** reopens it with `[true,false,true]` |
| 13.4 | Restart with `VID4YOU_CHANNEL=production`, `VID4YOU_RELEASE_TAG=v0.0.1` | Banner "A new version of Vid4You is available" with a **View release** link (`target=_blank`, `rel=noreferrer`, href the release URL) and a **Dismiss** button; Dismiss removes it. The dialog stayed closed (consent already answered) |
| 13.5 | Keyboard | 9 Tab presses with the dialog open: focus never left it (5 focusable elements, wrapped); ticking a box then pressing **Escape** closed the dialog and the server still reported `1|0|1` (nothing saved) |
| 13.6 | Restore | Executable, proxy and receiver stopped; throwaway folder only, nothing else touched |

## Deviation to know about (13.4)
The repository has no GitHub release yet, so the real check answers 404 and `/app/update` returns `available:false`. To show the banner, a pass-through proxy (scratchpad, not committed) answered **only** `GET /app/update` with `{"available":true,"tag":"v9.9.9",...}` and forwarded everything else. The banner rendering, link and dismissal are real; the live GitHub answer is not. Repeat 13.4 against a real release after the first one is published.

## Not checked
- Dialog and banner CSS were judged from one screenshot at desktop width; the third option's description sits close to the buttons. No narrow-width or light-theme check.
- Whether the dismissal survives a reload (not specified by the change; the banner returns on the next launch).

## Re-check after the product owner's decisions (13.7)
Decisions of 2026-10-18: "Not now" counts as an answer, and the dialog links to a published privacy policy. Rebuilt executable, fresh store (`1|0|0|0||<id>`), port 3197.
- The dialog shows a **Privacy policy** link → `https://github.com/TonyMElguezabal/AI4Devs-finalproject/blob/main/PRIVACY.md`, `target=_blank`, `rel=noreferrer`. It gives a 404 until `PRIVACY.md` reaches `main`.
- **Escape** on the fresh store: the row became `1|0|0|0|2026-10-18T23:40:46Z|<id>` (all off, `answered_at` set); after a reload the dialog stays closed.
- On an answered store: ticked *error reports* + **Save** → `errors:true`; reopened from **Privacy**, ticked another box, pressed **Not now** → dialog closed, server still `errors:true, providerUsage:false, productUsage:false, answered:true` (nothing changed).
