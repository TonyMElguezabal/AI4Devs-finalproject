# visual-style-settings Specification

## Purpose
TBD - created by archiving change admin-visual-style-prompt. Update Purpose after archive.
## Requirements
### Requirement: One visual style prompt is stored for the whole app

The system SHALL keep a single `visualStylePrompt` text, trimmed, of 0 to 8,000 characters. An empty prompt means "no style". `GET /admin/settings` SHALL answer 200 with `{ visualStylePrompt, referenceImage, updatedAt }`, where `referenceImage` is `null` or `{ contentType, sizeBytes, updatedAt }`. A fresh database SHALL answer an empty prompt and `referenceImage: null`.

`PUT /admin/settings/visual-style-prompt` with `{ visualStylePrompt }` SHALL trim the text, save it and answer 200 with the same body as `GET`. A prompt longer than 8,000 characters after trimming, or a body that is not an object with a string `visualStylePrompt`, SHALL answer 400 and save nothing.

#### Scenario: Fresh database

- **WHEN** the settings are read before anything was saved
- **THEN** the answer is 200 with `visualStylePrompt: ""` and `referenceImage: null`

#### Scenario: Prompt saved and trimmed

- **WHEN** the prompt `"  Warry, a 2D cartoon  "` is saved
- **THEN** the answer is 200 with `visualStylePrompt: "Warry, a 2D cartoon"` and a later read returns the same text

#### Scenario: Prompt cleared

- **WHEN** a non-empty prompt is replaced by `""`
- **THEN** the answer is 200 with `visualStylePrompt: ""`

#### Scenario: Prompt too long

- **WHEN** a prompt of 8,001 characters (after trimming) is saved
- **THEN** the answer is 400 and the previously saved prompt is unchanged

### Requirement: An optional reference image is stored, validated and never exposed by path

`PUT /admin/settings/reference-image` SHALL accept the raw bytes of one image with `Content-Type` `image/png`, `image/jpeg` or `image/webp`, of at most 5 MB, and answer 200 with the settings body. The bytes SHALL match the declared type's magic numbers; otherwise the answer is 400. Any other content type answers 400. A body larger than 5 MB answers 413. A rejected upload SHALL keep the previous image and row unchanged.

An accepted upload SHALL replace any earlier image. The file SHALL be written to a temporary name and renamed into place, so a failed upload never leaves a partial file. The stored location SHALL be relative to the app data directory, and no response SHALL contain it.

`GET /admin/settings/reference-image` SHALL stream the stored bytes with the stored content type, or answer 404 when there is none. `DELETE /admin/settings/reference-image` SHALL remove the file and clear the row's image fields, and answer 204 whether or not an image existed.

#### Scenario: Valid image stored

- **WHEN** a valid PNG of 100 KB is uploaded
- **THEN** the answer is 200 with `referenceImage: { contentType: "image/png", sizeBytes: 102400, updatedAt }`, and `GET /admin/settings/reference-image` returns the same bytes

#### Scenario: Bytes do not match the declared type

- **WHEN** a body that is not a PNG is uploaded with `Content-Type: image/png`
- **THEN** the answer is 400 and the previous image is kept

#### Scenario: Unsupported type

- **WHEN** a GIF is uploaded with `Content-Type: image/gif`
- **THEN** the answer is 400 and the previous image is kept

#### Scenario: Image too large

- **WHEN** a 6 MB image is uploaded
- **THEN** the answer is 413 and the previous image is kept

#### Scenario: Replacing the image

- **GIVEN** a stored PNG
- **WHEN** a valid JPEG is uploaded
- **THEN** the settings show `image/jpeg`, the PNG file no longer exists, and `GET` returns the JPEG bytes

#### Scenario: No image stored

- **WHEN** the image is requested while none is stored
- **THEN** the answer is 404

#### Scenario: Image removed

- **GIVEN** a stored image
- **WHEN** it is deleted
- **THEN** the answer is 204, the file no longer exists, the settings show `referenceImage: null`, and deleting again also answers 204

### Requirement: The reference image is not sent to any provider

The system SHALL NOT include the reference image, or any value derived from it, in any request to the reasoning, image, voice or video provider. The Fal image request body SHALL be identical whether or not a reference image is stored.

#### Scenario: Image request unchanged

- **GIVEN** a stored reference image and a saved style prompt
- **WHEN** a scene's image is generated
- **THEN** the request sent to the image provider has the same URL, headers and body as when no reference image and no style are stored

### Requirement: `/admin` edits the style and the reference image

The frontend SHALL render an admin page at the path `/admin`, and the usual application elsewhere. The page SHALL show the saved prompt in a textarea with a character counter against 8,000 and a hint that the pipeline rules (one pair per fragment, JSON output) win over the text; a save button; and, for the image, a file input, a preview of the stored image after a reload, and a remove button. The page SHALL say that the image is stored but not yet used for generation. After each save, upload or removal it SHALL show a success message, or the failure reason without losing what the user typed. Saving SHALL be disabled above 8,000 characters. The application SHALL offer a link to `/admin` from its top bar.

#### Scenario: Saving the prompt

- **WHEN** the User types a prompt on `/admin` and saves
- **THEN** a success message appears and the prompt is still shown after a reload

#### Scenario: Save rejected

- **WHEN** the backend answers 400 or is unreachable on save
- **THEN** an error message appears and the typed text stays in the textarea

#### Scenario: Image preview after reload

- **GIVEN** a stored image
- **WHEN** `/admin` is loaded
- **THEN** the image preview and a remove button are shown

#### Scenario: Unsupported file chosen

- **WHEN** the User picks a GIF or a file over 5 MB
- **THEN** the page shows the error and sends nothing, or shows the backend's refusal, and the stored image is unchanged

#### Scenario: Image removed

- **WHEN** the User removes the stored image
- **THEN** the preview disappears and survives a reload as absent

