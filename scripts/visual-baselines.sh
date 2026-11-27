#!/bin/bash
# Generate Linux screenshots in Actions, then import them for local review.
set -euo pipefail

fail() { printf '%s\n' "$*" >&2; exit 1; }
[ "$#" -ge 1 ] && [ "$#" -le 2 ] || fail "Usage: $0 <admin-ui|pilot-showcase|web-quality|all> [ref]"
project=$1
case "$project" in admin-ui|pilot-showcase|web-quality|all) ;; *) fail "Unknown project: $project" ;; esac
command -v gh >/dev/null || fail 'Install GitHub CLI and run gh auth login first.'
root=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
cd "$root"
branch=$(git symbolic-ref --quiet --short HEAD) || fail 'Check out a branch first.'
ref=${2:-$branch}
git check-ref-format --branch "$ref" >/dev/null || fail "Invalid branch: $ref"
# Run the workflow definition on our branch, while its ref input selects the source.
workflow=visual-baselines.yaml
actor=$(gh api user --jq .login)
title="Visual baselines - $project - $ref"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
list_runs() {
  gh run list --workflow "$workflow" --branch "$branch" --event workflow_dispatch \
    --user "$actor" --limit 100 --json databaseId,displayTitle \
    --template '{{range .}}{{.databaseId}}{{"\t"}}{{.displayTitle}}{{"\n"}}{{end}}'
}
list_runs > "$tmp/before"
gh workflow run "$workflow" --ref "$branch" -f "ref=$ref" -f "project=$project"
run_id=
for ((attempt=0; attempt<60; attempt++)); do
  list_runs > "$tmp/after"
  candidates=()
  while IFS=$'\t' read -r id run_title; do
    if [ "$run_title" = "$title" ] && ! cut -f1 "$tmp/before" | grep -qx "$id"; then
      candidates+=("$id")
    fi
  done < "$tmp/after"
  [ "${#candidates[@]}" -le 1 ] || fail 'Multiple matching runs appeared; import the intended run manually.'
  if [ "${#candidates[@]}" -eq 1 ]; then run_id=${candidates[0]}; break; fi
  sleep 2
done
[ -n "$run_id" ] || fail 'Dispatched run did not appear within two minutes. Check gh run list.'
printf 'Waiting for run %s\n' "$run_id"
gh run watch "$run_id" --exit-status
projects=("$project")
[ "$project" != all ] || projects=(admin-ui pilot-showcase web-quality)
# Download and validate every artifact before changing the checkout.
for item in "${projects[@]}"; do
  gh run download "$run_id" -n "visual-baselines-$item" -D "$tmp/$item"
  case "$item" in
    admin-ui) target=admin-ui/tests/browser/visual/screens.spec.ts-snapshots ;;
    pilot-showcase) target=pilot-showcase/tests/e2e/visual/snapshots ;;
    web-quality) target=web-quality/tests/snapshots ;;
  esac
  [ -d "$tmp/$item/$target" ] || fail "Artifact lacks $target"
  find "$tmp/$item/$target" -type f -name '*.png' > "$tmp/$item.files"
  [ -s "$tmp/$item.files" ] || fail "Artifact has no PNGs for $item"
done
for item in "${projects[@]}"; do
  while IFS= read -r source; do
    relative=${source#"$tmp/$item/"}
    mkdir -p "$(dirname "$relative")"
    cp "$source" "$relative"
  done < "$tmp/$item.files"
done
git status --short
printf 'Review the PNG changes before committing. Source run: %s\n' "$run_id"
