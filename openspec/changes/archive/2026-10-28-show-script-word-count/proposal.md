## Why

The script is locked once a project starts (PRD §4.2), and the video's length follows its narration. Today the User only learns how long the video will be after paying for a voice-over. A word count and a rough duration under the Script field lets them check the length before they start (JOS-236).

## What Changes

- The *Start a project* form shows a line under the Script field: `38 words · Estimated video duration ~0:15`.
  - Words are the script split on whitespace. A hyphenated word or a number counts as one word.
  - The duration is the word count at 150 words per minute, the usual narration pace, rounded to the nearest second and shown as `~m:ss`.
  - It updates live while the User types, so it is current when they leave the field. It is hidden while the script is empty or only whitespace.
- It is an estimate only. It never blocks or changes the submission, and it adds no word limit (PRD §4.1).
- PRD v1.26: one sentence in §4.1 and a changelog entry.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `session-creation`: adds a requirement that the start form shows the script's word count and an estimated duration, for information only.

## Impact

- **Frontend:**
  - new `frontend/src/scriptEstimate.ts`;
  - `StartProjectForm.tsx`;
  - `styles/app.css` (`.field-hint`);
  - `frontend/test/`.
- **Backend:** none. There is no new endpoint, field or migration.
- **Docs:**
  - PRD v1.26 (§4.1 and §16);
  - the *Start a project* row of the Screen Inventory in `docs/frontend-standards.md`.
- **Privacy:** the script is not sent anywhere for this, and nothing is logged.
