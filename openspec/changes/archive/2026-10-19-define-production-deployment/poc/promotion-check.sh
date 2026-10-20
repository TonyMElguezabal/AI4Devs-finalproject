#!/usr/bin/env bash
# JOS-194 proof of concept — task 7.7: promotion keyed by source tree, failing closed. Runs entirely in a scratch repository.
# The "registry" is a directory of tag files; the real pipeline checks `docker manifest inspect <image>:tree-<hash>`.
set -euo pipefail
W="$(mktemp -d)"; trap 'rm -rf "$W"' EXIT
cd "$W" && git init -q -b main . && git config user.email t@t && git config user.name t
REG="$W/registry"; mkdir "$REG"
echo "v1" > app.txt && git add . && git commit -qm "main base"
git switch -qc uat && echo "v2" > app.txt && git commit -qam "feature merged into UAT"
UAT_TREE="$(git rev-parse HEAD^{tree})"; touch "$REG/tree-$UAT_TREE"          # UAT deploy records the image it ran
lookup() { [ -e "$REG/tree-$(git rev-parse "$1^{tree}")" ] && echo FOUND || echo "NOT FOUND (production job fails closed)"; }
git switch -q main && git merge -q --no-ff uat -m "Merge uat into main"          # GitHub-style merge: new commit SHA
echo "UAT commit  $(git rev-parse --short uat)  tree ${UAT_TREE:0:10}"
echo "main commit $(git rev-parse --short main)  tree $(git rev-parse main^{tree} | cut -c1-10)"
echo "1. merge commit, same content as UAT:  $(lookup main)"
echo extra > extra.txt && git add . && git commit -qm "hotfix pushed straight to main"
echo "2. extra commit UAT never ran:         $(lookup main)"
