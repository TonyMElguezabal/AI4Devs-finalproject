## ADDED Requirements

### Requirement: One command per target builds the packaged application

From a clean checkout with dependencies installed in `backend/` and `frontend/`, one documented command per target SHALL build the packaged application for macOS arm64, macOS x64 or Windows x64 from the product tree. The output folder SHALL contain the executable (`Vid4You`, or `Vid4You.exe` on Windows), `ffmpeg` and `ffprobe` for that target, and nothing under `openspec/` SHALL be part of the build path.

#### Scenario: Windows target

- **WHEN** the build command for Windows x64 runs on a clean checkout
- **THEN** the output folder holds `Vid4You.exe`, `ffmpeg.exe` and `ffprobe.exe`

#### Scenario: macOS target

- **WHEN** the build command for macOS arm64 or macOS x64 runs on a Mac
- **THEN** the output folder holds an ad-hoc signed `Vid4You`, `ffmpeg` and `ffprobe` for that architecture

#### Scenario: Target that the host cannot sign

- **WHEN** a macOS target is requested on a host that cannot sign for macOS
- **THEN** the build fails before producing an executable and says which host it needs

### Requirement: Downloaded binaries are verified

The build SHALL verify the SHA-256 of the official Node binary and of every ffmpeg and ffprobe binary it uses against checksums committed in the repository, and SHALL fail without producing an executable when one does not match.

#### Scenario: Checksum mismatch

- **WHEN** a downloaded binary does not match its committed checksum
- **THEN** the build fails with a message naming the file and the expected and actual values
- **AND** no executable is written to the output folder

### Requirement: Packaged entry starts the application

The packaged executable SHALL serve the embedded interface and the API on `127.0.0.1:3100`, open the default browser, answer `GET /health` with `{"ok":true}`, and store its data under `~/Library/Application Support/Vid4You` (macOS) or `%APPDATA%\Vid4You` (Windows), including the database, the project folders, the credentials file `.secrets.json`, the settings override and the provider master-key file.

#### Scenario: First start on a clean profile

- **WHEN** the executable starts on a user profile with no Vid4You folder
- **THEN** the data folder is created, the interface loads on `http://127.0.0.1:3100/`, `GET /health` answers `{"ok":true}` and the browser opens

#### Scenario: Data folder override

- **WHEN** `VID4YOU_DATA_DIR` is set
- **THEN** every item above is kept under that folder instead

### Requirement: Second launch opens the running instance

When the packaged executable starts while an instance already answers `GET /health` on its port, it SHALL open the browser on that instance and exit without starting another backend.

#### Scenario: Second launch

- **WHEN** the executable is started while one instance is running
- **THEN** the browser opens on the running instance and the second process exits
- **AND** no second backend opens the store

### Requirement: Packaged build does not depend on proof-of-concept substitutions

The backend source SHALL run unchanged inside the bundle: ffmpeg and ffprobe locations SHALL come from `FFMPEG_PATH` and `FFPROBE_PATH` set by the packaged entry to the bundled binaries; the credentials file SHALL be `.secrets.json` in the data folder; the bundle SHALL NOT replace `import.meta` values, patch `child_process`, or cut code from `server.ts`.

#### Scenario: Assembly in the packaged build

- **WHEN** a session reaches assembly in the packaged executable
- **THEN** the backend runs the bundled `ffmpeg` and `ffprobe` found beside the executable

#### Scenario: Credentials file

- **WHEN** `.secrets.json` exists in the data folder and the environment has no provider key
- **THEN** the key is read from that file

### Requirement: Packaged build ignores test switches

The packaged executable SHALL ignore `ALLOW_TEST_ENDPOINTS` and every `USE_STUB_*` variable set in its environment and SHALL NOT serve `/docs`.

#### Scenario: Test switches set

- **WHEN** `ALLOW_TEST_ENDPOINTS=1` and `USE_STUB_VOICE_PROVIDER=success` are set and the executable starts
- **THEN** no test endpoint answers, no stub provider is active and `GET /docs` answers 404

### Requirement: Build steps are covered by checks that need no network

The bundling step, the checksum verification, the data-folder resolution and the environment sanitising SHALL each be covered by an automated test that runs without network access.

#### Scenario: Offline test run

- **WHEN** the backend test suite runs with no network
- **THEN** the packaging tests pass
