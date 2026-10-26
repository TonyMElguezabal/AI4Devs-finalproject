#!/usr/bin/env bash
# sign-executables (JOS-207) Decision 5 — Developer ID signing and notarization of a built macOS folder.
#   sign-macos.sh sign <dir>       temporary keychain, then codesign ffmpeg, ffprobe and Vid4You (hardened runtime, timestamp) and verify
#   sign-macos.sh notarize <dir>   submit the folder to Apple and wait; prints the log and fails unless it is Accepted
#   sign-macos.sh cleanup          delete the temporary keychain (run in an `always()` step)
# Secrets arrive only as environment variables of the step; nothing here prints them.
set -euo pipefail

keychain="${RUNNER_TEMP:?}/signing.keychain-db"
entitlements="$(dirname "$0")/../../backend/packaging/entitlements.plist"

command="${1:-}"; shift || true
case "$command" in
  sign)
    dir="${1:?folder}"
    password="$(uuidgen)" # the keychain's own throwaway password, unrelated to any secret
    security create-keychain -p "$password" "$keychain"
    security set-keychain-settings -lut 3600 "$keychain"
    security unlock-keychain -p "$password" "$keychain"
    printf '%s' "$MACOS_CERTIFICATE_P12" | base64 --decode > "${RUNNER_TEMP}/certificate.p12"
    security import "${RUNNER_TEMP}/certificate.p12" -P "$MACOS_CERTIFICATE_PASSWORD" -A -t cert -f pkcs12 -k "$keychain" >/dev/null
    rm -f "${RUNNER_TEMP}/certificate.p12"
    security set-key-partition-list -S apple-tool:,apple: -s -k "$password" "$keychain" >/dev/null
    security list-keychains -d user -s "$keychain" login.keychain-db
    identity="$(security find-identity -v -p codesigning "$keychain" | sed -n 's/.*"\(Developer ID Application:.*\)".*/\1/p' | head -1)"
    [[ -n "$identity" ]] || { echo "no Developer ID Application identity in the imported certificate" >&2; exit 1; }
    for name in ffmpeg ffprobe Vid4You; do # the helpers first, the application last
      codesign --force --options runtime --timestamp --entitlements "$entitlements" --sign "$identity" "$dir/$name"
      codesign --verify --strict "$dir/$name"
    done ;;
  notarize)
    dir="${1:?folder}"
    printf '%s' "$APPLE_API_KEY_P8" > "${RUNNER_TEMP}/AuthKey.p8"
    ditto -c -k --keepParent "$dir" "${RUNNER_TEMP}/notarize.zip"
    output="$(xcrun notarytool submit "${RUNNER_TEMP}/notarize.zip" --key "${RUNNER_TEMP}/AuthKey.p8" --key-id "$APPLE_API_KEY_ID" --issuer "$APPLE_API_ISSUER_ID" --wait)"
    echo "$output" | grep -v -F -e "$APPLE_API_KEY_ID" -e "$APPLE_API_ISSUER_ID" || true
    status=0
    echo "$output" | grep -q 'status: Accepted' || status=1
    if [[ $status -ne 0 ]]; then
      id="$(echo "$output" | awk '/^ *id:/{print $2; exit}')"
      xcrun notarytool log "$id" --key "${RUNNER_TEMP}/AuthKey.p8" --key-id "$APPLE_API_KEY_ID" --issuer "$APPLE_API_ISSUER_ID" || true
    fi
    rm -f "${RUNNER_TEMP}/AuthKey.p8" "${RUNNER_TEMP}/notarize.zip"
    exit $status ;;
  cleanup)
    security delete-keychain "$keychain" 2>/dev/null || true ;;
  *) echo "usage: sign-macos.sh sign|notarize|cleanup ..." >&2; exit 2 ;;
esac
