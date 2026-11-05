# Step 5: packaged executable and `GET /app/update` (JOS-206)

The Actions run could not be used (see step 7), so the macOS arm64 build was made locally with the release workflow's variables:

```
VID4YOU_CHANNEL=production VID4YOU_VERSION=2026.10.26-test VID4YOU_RELEASE_TAG=release-localcheck npm run package:darwin-arm64
VID4YOU_DATA_DIR=<scratch> VID4YOU_NO_BROWSER=1 VID4YOU_PORT=3199 ./dist-package/darwin-arm64/Vid4You
```

| Command | Response |
|---|---|
| `curl localhost:3199/health` | `{"ok":true}` |
| `curl localhost:3199/app/update` | `{"available":false}` |

The log shows `update check failed: GitHub answered 404`. A development build returns `available: false` without calling GitHub, so the call proves the executable carries channel `production` and a release tag. The repository has no published release yet, so `/releases/latest` answers 404.

**Not verified here:** the `available: true` flip. The check's URL is fixed to `api.github.com`, so there is no local stand-in, and a `test-<hash>` pre-release is never returned by `/releases/latest`. The flip is covered by `test/update-check.test.ts`; end to end it can only be seen once a real release exists and a build with an older tag runs.

The scratch data folder was deleted; the process was stopped.
