#!/usr/bin/env bash
# enable-release-workflow (JOS-206) Decisions 2, 5 and 8 — the release decisions, testable without GitHub.
#   release.sh state <tree> [existing-tag...]   prints `build`, or `skip` when release-<tree> already exists
#   release.sh tag <tree> [release|test]        prints release-<tree> (or test-<tree>)
#   release.sh version <tree> <YYYY-MM-DD>      prints YYYY.MM.DD-<first 7 of tree>
#   release.sh checksums <dir>                  writes <dir>/SHA256SUMS.txt for the zips in <dir>
#   release.sh verify <dir>                     checks the zips in <dir> against <dir>/SHA256SUMS.txt
set -euo pipefail

require_tree() { [[ "$1" =~ ^[0-9a-f]{40}$ ]] || { echo "not a full tree hash: $1" >&2; exit 2; }; }
# sha256sum on Linux and Windows runners, shasum on macOS; both print and read the same format.
sha256() { if command -v sha256sum >/dev/null; then sha256sum "$@"; else shasum -a 256 "$@"; fi; }

command="${1:-}"; shift || true
case "$command" in
  state)
    tree="${1:-}"; require_tree "$tree"; shift
    for existing in "$@"; do [[ "$existing" == "release-$tree" ]] && { echo skip; exit 0; }; done
    echo build ;;
  tag)
    tree="${1:-}"; require_tree "$tree"
    echo "${2:-release}-$tree" ;;
  version)
    tree="${1:-}"; require_tree "$tree"
    echo "${2//-/.}-${tree:0:7}" ;;
  checksums)
    cd "${1:?directory}"; sha256 ./*.zip | sed 's# \./# #' > SHA256SUMS.txt ;;
  verify)
    cd "${1:?directory}"
    if command -v sha256sum >/dev/null; then sha256sum -c SHA256SUMS.txt; else shasum -a 256 -c SHA256SUMS.txt; fi ;;
  *) echo "usage: release.sh state|tag|version|checksums|verify ..." >&2; exit 2 ;;
esac
