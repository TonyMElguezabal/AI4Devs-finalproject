#!/usr/bin/env bash
# sign-executables (JOS-207) Decisions 3 and 6 — the signing decisions, testable without certificates.
#   signing.sh decide <required> <SECRET_NAME>...   prints `sign` or `unsigned`; fails naming (never printing) a missing secret when <required> is `true`
#   signing.sh notes <dir>                          prints the release-notes line for unsigned archives in <dir> (nothing when all are signed)
set -euo pipefail

command="${1:-}"; shift || true
case "$command" in
  decide)
    required="${1:-}"; shift
    missing=()
    for name in "$@"; do [[ -n "${!name:-}" ]] || missing+=("$name"); done
    if [[ ${#missing[@]} -eq 0 ]]; then echo sign
    elif [[ "$required" == true ]]; then echo "signing is required but these secrets are not set: ${missing[*]}" >&2; exit 1
    else echo unsigned; fi ;;
  notes)
    compgen -G "${1:?directory}/*-unsigned.zip" >/dev/null && echo "Some executables are not signed: macOS and Windows will warn on first start." || true ;;
  *) echo "usage: signing.sh decide|notes ..." >&2; exit 2 ;;
esac
