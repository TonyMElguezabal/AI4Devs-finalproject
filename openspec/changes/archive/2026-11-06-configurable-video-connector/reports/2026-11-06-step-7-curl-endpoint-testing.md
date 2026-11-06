# Step 7 — Manual endpoint testing with curl (2026-11-06)

Backend from the worktree on port 3200 with a scratch `DB_PATH`, `PROJECTS_ROOT` and `PROVIDER_KEY_PATH` in the session scratchpad. The Administrator password and the Runway key were read from the git-ignored secrets file inside the script; both are redacted below, and the key hint too. The definition sent is the Runway fixture of `docs/video-connector-definitions.md`.

Each call is `curl -s -X <METHOD> http://127.0.0.1:3200<path> -H 'Authorization: Bearer <admin-password>' [-H 'Content-Type: application/json' --data-binary <body>]`.

## Summary

| # | Call | Request | HTTP | Outcome |
| --- | --- | --- | --- | --- |
| 1 | 7.1 adapter types | `GET /admin/provider-types` | 200 | listed `configured-video` with its fields |
| 2 | 7.2 valid Runway Wan connector | `POST /admin/provider-profiles` | 201 | keyStatus `stored`, usable `true` |
| 3 | 7.2 refused: {key} in a body | `POST /admin/provider-profiles` | 400 | requests.submit.body: may not use {key}: the key goes only in a header |
| 4 | 7.2 refused: shortest clip 8 | `POST /admin/provider-profiles` | 400 | admittedDurationSeconds.min: must not be longer than the 5 s segmentation lower bound |
| 5 | 7.2 refused: http base URL | `POST /admin/provider-profiles` | 400 | baseUrl: must be https:// followed by a host and an optional port, with no path, query or credentials |
| 6 | 7.2 refused: 2K resolution | `POST /admin/provider-profiles` | 400 | resolution: must be at most 1080p (2K and above cost too much per clip second) |
| 7 | 7.2 connection test, real key | `POST /admin/provider-profiles/01M6QTXDXAFQ0B84J9KN22NZNQ/test` | 200 | outcome `connected` |
| 8 | 7.2 connector with a wrong key | `POST /admin/provider-profiles` | 201 | keyStatus `stored`, usable `true` |
| 9 | 7.2 connection test, wrong key | `POST /admin/provider-profiles/01M6QTXEDYR0VGJHXR2ZF77C9C/test` | 200 | outcome `key-rejected` |
| 10 | 7.2 duplicate for kling_4 with copyKeyFrom | `POST /admin/provider-profiles` | 201 | keyStatus `stored` (copied, never sent to the page), usable `true` |
| 11 | 7.2 connection test of the duplicate | `POST /admin/provider-profiles/01M6QTXEHBJEHFGMK1A7EMS7S1/test` | 200 | outcome `connected` |
| 12 | 7.2 refused: copyKeyFrom to another host | `POST /admin/provider-profiles` | 400 | copyKeyFrom: a key can only be copied from a configured connector on the same host |
| 13 | 7.2 host change clears the key | `PUT /admin/provider-profiles/01M6QTXEDYR0VGJHXR2ZF77C9C` | 200 | keyCleared `true`, keyStatus `missing`, usable `false` |
| 14 | 7.3 restore: delete Runway Wan | `DELETE /admin/provider-profiles/01M6QTXDXAFQ0B84J9KN22NZNQ` | 200 | `removed` |
| 15 | 7.3 restore: delete Runway wrong key | `DELETE /admin/provider-profiles/01M6QTXEDYR0VGJHXR2ZF77C9C` | 200 | `removed` |
| 16 | 7.3 restore: delete Runway Kling | `DELETE /admin/provider-profiles/01M6QTXEHBJEHFGMK1A7EMS7S1` | 200 | `removed` |
| 17 | 7.3 restore: remaining profiles | `GET /admin/provider-profiles` | 200 | video: RunningHub (active: True) |

Row 1 lists the `configured-video` type with the fields `baseUrl`, `model`, `resolution`, `admittedDurationSeconds.min`/`.max`, `requests` (kind `json`), `pricePerUnit` and `priceCurrency`.

No answer contained the key or the password (checked on the raw log). After the restore, the scratch database has the seeded profiles only and RunningHub is the active video provider.

## Calls and answers

### 1. 7.1 adapter types

`GET /admin/provider-types` → HTTP 200

```json
[{"id": "configured-video", "stage": "video", "label": "Configured connector", "fields": [{"path": ["baseUrl"], "label": "Base URL", "kind": "text", "required": true, "help": "https:// and the vendor's API host, for example https://api.dev.runwayml.com. The key is sent only to this host; changing the host clears the stored key."}, {"path": ["model"], "label": "Model", "kind": "text", "required": true, "help": "Fills {model}, for example wan3 or kling_4."}, {"path": ["resolution"], "label": "Clip resolution", "kind": "text", "required": true, "help": "Fills {resolution} as the vendor writes it, for example auto_720p or 768P. At most 1080p."}, {"path": ["admittedDurationSeconds", "min"], "label": "Shortest clip (seconds)", "kind": "number", "required": true}, {"path": ["admittedDurationSeconds", "max"], "label": "Longest clip (seconds)", "kind": "number", "required": true}, {"path": ["requests"], "label": "Requests (JSON)", "kind": "json", "required": true, "help": "The headers and the upload, submit, poll and check steps. See docs/video-connector-definitions.md for the Runway and RunningHub definitions."}, {"path": ["pricePerUnit"], "label": "Price per clip second", "kind": "number", "required": false, "help": "Optional. Leave empty if the provider has no price."}, {"path": ["priceCurrency"], "label": "Currency", "kind": "text", "required": false, "help": "A three-letter code such as USD. Needed with a price."}], "connectionCheck": {"charged": false, "covers": "Only the key wa
```

### 2. 7.2 valid Runway Wan connector

`POST /admin/provider-profiles` → HTTP 201

```json
{"stage": "video", "adapterType": "configured-video", "label": "Runway Wan", "parameters": {"baseUrl": "https://api.dev.runwayml.com", "model": "wan3", "resolution": "1280:720", "admittedDurationSeconds": {"min": 5, "max": 10}, "requests": "<Runway definition>"}, "apiKey": "<runway-key>"}
```

```json
{"id":"01M6QTXDXAFQ0B84J9KN22NZNQ","stage":"video","adapterType":"configured-video","label":"Runway Wan","parameters":{"baseUrl":"https://api.dev.runwayml.com","model":"wan3","resolution":"1280:720","admittedDurationSeconds":{"min":5,"max":10},"requests":{"headers":{"Authorization":"Bearer {key}","X-Runway-Version":"2024-11-06"},"submit":{"method":"POST","path":"/v1/image_to_video","body":{"model":"{model}","promptText":"{instruction}","promptImage":"{image_data_uri}","duration":"{duration}","ratio":"{resolution}"},"taskIdAt":"id"},"poll":{"method":"GET","path":"/v1/tasks/{task_id}","statusAt":"status","doneWhen":["SUCCEEDED"],"failedWhen":["FAILED","CANCELLED"],"videoUrlAt":"output[0]","errorAt":"failureCode","notFoundStatus":404},"check":{"method":"GET","path":"/v1/organization","connectedStatus":200,"charged":false}}},"keyStatus":"stored","keyHint":"****","usable":true,"problems":[],"active":false,"retired":false}
```

### 3. 7.2 refused: {key} in a body

`POST /admin/provider-profiles` → HTTP 400

```json
{"stage": "video", "adapterType": "configured-video", "label": "Bad", "parameters": {"baseUrl": "https://api.dev.runwayml.com", "model": "wan3", "resolution": "1280:720", "admittedDurationSeconds": {"min": 5, "max": 10}, "requests": "<Runway definition with promptText: \"{key}\">"}, "apiKey": "<runway-key>"}
```

```json
{"ok":false,"problems":[{"field":"requests.submit.body","message":"requests.submit.body: may not use {key}: the key goes only in a header"}]}
```

### 4. 7.2 refused: shortest clip 8

`POST /admin/provider-profiles` → HTTP 400

```json
{"stage": "video", "adapterType": "configured-video", "label": "Bad", "parameters": {"baseUrl": "https://api.dev.runwayml.com", "model": "wan3", "resolution": "1280:720", "admittedDurationSeconds": {"min": 8, "max": 10}, "requests": "<Runway definition with promptText: \"{key}\">"}, "apiKey": "<runway-key>"}
```

```json
{"ok":false,"problems":[{"field":"admittedDurationSeconds.min","message":"admittedDurationSeconds.min: must not be longer than the 5 s segmentation lower bound"}]}
```

### 5. 7.2 refused: http base URL

`POST /admin/provider-profiles` → HTTP 400

```json
{"stage": "video", "adapterType": "configured-video", "label": "Bad", "parameters": {"baseUrl": "http://api.dev.runwayml.com", "model": "wan3", "resolution": "1280:720", "admittedDurationSeconds": {"min": 5, "max": 10}, "requests": "<Runway definition with promptText: \"{key}\">"}, "apiKey": "<runway-key>"}
```

```json
{"ok":false,"problems":[{"field":"baseUrl","message":"baseUrl: must be https:// followed by a host and an optional port, with no path, query or credentials"}]}
```

### 6. 7.2 refused: 2K resolution

`POST /admin/provider-profiles` → HTTP 400

```json
{"stage": "video", "adapterType": "configured-video", "label": "Bad", "parameters": {"baseUrl": "https://api.dev.runwayml.com", "model": "wan3", "resolution": "2560:1440", "admittedDurationSeconds": {"min": 5, "max": 10}, "requests": "<Runway definition with promptText: \"{key}\">"}, "apiKey": "<runway-key>"}
```

```json
{"ok":false,"problems":[{"field":"resolution","message":"resolution: must be at most 1080p (2K and above cost too much per clip second)"}]}
```

### 7. 7.2 connection test, real key

`POST /admin/provider-profiles/01M6QTXDXAFQ0B84J9KN22NZNQ/test` → HTTP 200

```json
{"outcome":"connected","covers":"Only the key was checked. The model and the requests were not."}
```

### 8. 7.2 connector with a wrong key

`POST /admin/provider-profiles` → HTTP 201

```json
{"stage": "video", "adapterType": "configured-video", "label": "Runway wrong key", "parameters": {"baseUrl": "https://api.dev.runwayml.com", "model": "wan3", "resolution": "1280:720", "admittedDurationSeconds": {"min": 5, "max": 10}, "requests": "<Runway definition>"}, "apiKey": "<wrong-key>"}
```

```json
{"id":"01M6QTXEDYR0VGJHXR2ZF77C9C","stage":"video","adapterType":"configured-video","label":"Runway wrong key","parameters":{"baseUrl":"https://api.dev.runwayml.com","model":"wan3","resolution":"1280:720","admittedDurationSeconds":{"min":5,"max":10},"requests":{"headers":{"Authorization":"Bearer {key}","X-Runway-Version":"2024-11-06"},"submit":{"method":"POST","path":"/v1/image_to_video","body":{"model":"{model}","promptText":"{instruction}","promptImage":"{image_data_uri}","duration":"{duration}","ratio":"{resolution}"},"taskIdAt":"id"},"poll":{"method":"GET","path":"/v1/tasks/{task_id}","statusAt":"status","doneWhen":["SUCCEEDED"],"failedWhen":["FAILED","CANCELLED"],"videoUrlAt":"output[0]","errorAt":"failureCode","notFoundStatus":404},"check":{"method":"GET","path":"/v1/organization","connectedStatus":200,"charged":false}}},"keyStatus":"stored","keyHint":"****","usable":true,"problems":[],"active":false,"retired":false}
```

### 9. 7.2 connection test, wrong key

`POST /admin/provider-profiles/01M6QTXEDYR0VGJHXR2ZF77C9C/test` → HTTP 200

```json
{"outcome":"key-rejected","covers":"Only the key was checked. The model and the requests were not."}
```

### 10. 7.2 duplicate for kling_4 with copyKeyFrom

`POST /admin/provider-profiles` → HTTP 201

```json
{"stage": "video", "adapterType": "configured-video", "label": "Runway Kling", "parameters": {"baseUrl": "https://api.dev.runwayml.com", "model": "kling_4", "resolution": "auto_720p", "admittedDurationSeconds": {"min": 5, "max": 10}, "requests": "<Runway definition>"}, "copyKeyFrom": "01M6QTXDXAFQ0B84J9KN22NZNQ"}
```

```json
{"id":"01M6QTXEHBJEHFGMK1A7EMS7S1","stage":"video","adapterType":"configured-video","label":"Runway Kling","parameters":{"baseUrl":"https://api.dev.runwayml.com","model":"kling_4","resolution":"auto_720p","admittedDurationSeconds":{"min":5,"max":10},"requests":{"headers":{"Authorization":"Bearer {key}","X-Runway-Version":"2024-11-06"},"submit":{"method":"POST","path":"/v1/image_to_video","body":{"model":"{model}","promptText":"{instruction}","promptImage":"{image_data_uri}","duration":"{duration}","ratio":"{resolution}"},"taskIdAt":"id"},"poll":{"method":"GET","path":"/v1/tasks/{task_id}","statusAt":"status","doneWhen":["SUCCEEDED"],"failedWhen":["FAILED","CANCELLED"],"videoUrlAt":"output[0]","errorAt":"failureCode","notFoundStatus":404},"check":{"method":"GET","path":"/v1/organization","connectedStatus":200,"charged":false}}},"keyStatus":"stored","keyHint":"****","usable":true,"problems":[],"active":false,"retired":false}
```

### 11. 7.2 connection test of the duplicate

`POST /admin/provider-profiles/01M6QTXEHBJEHFGMK1A7EMS7S1/test` → HTTP 200

```json
{"outcome":"connected","covers":"Only the key was checked. The model and the requests were not."}
```

### 12. 7.2 refused: copyKeyFrom to another host

`POST /admin/provider-profiles` → HTTP 400

```json
{"stage": "video", "adapterType": "configured-video", "label": "Other", "parameters": {"baseUrl": "https://other.example", "model": "wan3", "resolution": "1280:720", "admittedDurationSeconds": {"min": 5, "max": 10}, "requests": "<Runway definition>"}, "copyKeyFrom": "01M6QTXDXAFQ0B84J9KN22NZNQ"}
```

```json
{"ok":false,"problems":[{"field":"copyKeyFrom","message":"copyKeyFrom: a key can only be copied from a configured connector on the same host"}]}
```

### 13. 7.2 host change clears the key

`PUT /admin/provider-profiles/01M6QTXEDYR0VGJHXR2ZF77C9C` → HTTP 200

```json
{"label": "Runway wrong key", "parameters": {"baseUrl": "https://other.example", "model": "wan3", "resolution": "1280:720", "admittedDurationSeconds": {"min": 5, "max": 10}, "requests": "<Runway definition>"}}
```

```json
{"id":"01M6QTXEDYR0VGJHXR2ZF77C9C","stage":"video","adapterType":"configured-video","label":"Runway wrong key","parameters":{"baseUrl":"https://other.example","model":"wan3","resolution":"1280:720","admittedDurationSeconds":{"min":5,"max":10},"requests":{"headers":{"Authorization":"Bearer {key}","X-Runway-Version":"2024-11-06"},"submit":{"method":"POST","path":"/v1/image_to_video","body":{"model":"{model}","promptText":"{instruction}","promptImage":"{image_data_uri}","duration":"{duration}","ratio":"{resolution}"},"taskIdAt":"id"},"poll":{"method":"GET","path":"/v1/tasks/{task_id}","statusAt":"status","doneWhen":["SUCCEEDED"],"failedWhen":["FAILED","CANCELLED"],"videoUrlAt":"output[0]","errorAt":"failureCode","notFoundStatus":404},"check":{"method":"GET","path":"/v1/organization","connectedStatus":200,"charged":false}}},"keyStatus":"missing","keyHint":null,"usable":false,"problems":[{"field":"apiKey","message":"apiKey: no API key is stored or found for this provider"}],"active":false,"retired":false,"keyCleared":true}
```

### 14. 7.3 restore: delete Runway Wan

`DELETE /admin/provider-profiles/01M6QTXDXAFQ0B84J9KN22NZNQ` → HTTP 200

```json
{"result":"removed"}
```

### 15. 7.3 restore: delete Runway wrong key

`DELETE /admin/provider-profiles/01M6QTXEDYR0VGJHXR2ZF77C9C` → HTTP 200

```json
{"result":"removed"}
```

### 16. 7.3 restore: delete Runway Kling

`DELETE /admin/provider-profiles/01M6QTXEHBJEHFGMK1A7EMS7S1` → HTTP 200

```json
{"result":"removed"}
```

### 17. 7.3 restore: remaining profiles

`GET /admin/provider-profiles` → HTTP 200

```json
{"profiles":[{"id":"openai-decomposition","stage":"reasoning","adapterType":"openai-reasoning","label":"OpenAI","parameters":{"model":"gpt-6-astra"},"keyStatus":"environment","keyHint":null,"usable":true,"problems":[],"active":true,"retired":false},{"id":"ElevenLabs","stage":"voice","adapterType":"elevenlabs-voice","label":"ElevenLabs","parameters":{"model":"eleven_multilingual_v2","voiceId":"4YYIPFl9wE5c4L2eu2Gb","voiceName":"Burt Reynolds™","outputFormat":"mp3_44100_128","speed":"default"},"keyStatus":"environment","keyHint":null,"usable":true,"problems":[],"active":true,"retired":false},{"id":"elevenlabs-forced-alignment","stage":"alignment","adapterType":"elevenlabs-alignment","label":"ElevenLabs","parameters":{"endpoint":"/v1/forced-alignment"},"keyStatus":"environment","keyHint":null,"usable":true,"problems":[],"active":true,"retired":false},{"id":"Fal.ai","stage":"image","adapterType":"fal-image","label":"Fal.ai","parameters":{"model":"fal-ai/flux/dev"},"keyStatus":"environment","keyHint":null,"usable":true,"problems":[],"active":true,"retired":false},{"id":"RunningHub","stage":"video","adapterType":"runninghub-video","label":"RunningHub","parameters":{"endpoint":"/openapi/v2/minimax/hailuo-h3/image-to-video","admittedDurationSeconds":{"min":5,"max":15},"resolution":"768P"},"keyStatus":"environment","keyHint":null,"usable":true,"problems":[],"active":true,"retired":false}]}
```
