#!/usr/bin/env bash
# check-harness-diff.sh — report exact file-level diff between our vendored
# harness and upstream `harness/main`.
#
# Companion to `check-upstream.sh` (which reports commit count). This one
# reports per-file changes, so you can see at a glance whether we're drifting
# on files we shouldn't be.
#
# Usage: script/check-harness-diff.sh
# Exits 0 regardless of diff size — informational.
#
# Output: three sections
#   1. Files changed (per-file list, post-filter for noise + known divergences)
#   2. Summary (insertions/deletions vs upstream HEAD)
#   3. Verdict (clean / known divergences / unexpected drift)

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
VENDORED="$REPO_ROOT/packages/bcode-browser/harness"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

if ! git remote | grep -qx "harness"; then
  echo "error: 'harness' remote not configured. Add it:" >&2
  echo "  git remote add harness https://github.com/browser-use/browser-harness.git" >&2
  exit 1
fi

git fetch --quiet harness main

UPSTREAM_HEAD="$(git rev-parse harness/main)"
UPSTREAM_SHORT="$(git rev-parse --short harness/main)"

# Extract upstream HEAD into a temp dir without touching index/worktree.
# `git archive | tar -x` is the right tool here — `git --work-tree=X checkout`
# mutates the active index relative to the current branch, which is wrong.
git archive --format=tar "$UPSTREAM_HEAD" | tar -xf - -C "$TMP"

# Known-divergence filter:
#   - .gitignore (we add .venv/ — see UPSTREAM.md §3 divergences table)
# Build artifacts the vendored side might generate during smoke tests:
#   - uv.lock, .venv/, __pycache__/, *.egg-info/, *.pyc
# These are gitignored on our side, but `diff -rq` doesn't read .gitignore.
# Files in the divergences table go in EXPECTED; everything else is drift.
EXPECTED_REGEX='/(\.gitignore)( |$)'
# `diff -rq` emits two line shapes:
#   "Files A and B differ"
#   "Only in <dir>: <name>"
# Match noise in either shape.
NOISE_REGEX='(uv\.lock|\.venv|__pycache__|\.egg-info|\.pyc|\.cache)'

DIFF_OUT="$(diff -rq "$VENDORED/" "$TMP/" 2>&1 | grep -Ev "$NOISE_REGEX" || true)"

echo "=== vendored vs harness/main ($UPSTREAM_SHORT) ==="
echo

if [[ -z "$DIFF_OUT" ]]; then
  echo "  No differences. Vendored harness matches upstream HEAD exactly."
  echo
  exit 0
fi

EXPECTED="$(echo "$DIFF_OUT" | grep -E "$EXPECTED_REGEX" || true)"
UNEXPECTED="$(echo "$DIFF_OUT" | grep -Ev "$EXPECTED_REGEX" || true)"

if [[ -n "$EXPECTED" ]]; then
  echo "Known divergences (UPSTREAM.md §3):"
  echo "$EXPECTED" | sed 's|^|  |'
  echo
fi

if [[ -n "$UNEXPECTED" ]]; then
  echo "Unexpected drift:"
  echo "$UNEXPECTED" | sed 's|^|  |'
  echo
  echo "Each line is one of:"
  echo "  - upstream commit we haven't synced yet (run script/check-upstream.sh to see commits behind), or"
  echo "  - a Yellow-zone modification we forgot to record in UPSTREAM.md §3."
  echo
fi

# Per-file line stats vs upstream, excluding noise + known-divergence files.
# `diff -ruN` emits per-hunk patch text; we want body lines only (skip
# +++/--- headers and @@ hunk markers), and we exclude any hunk whose header
# matched the noise regex.
echo "Line stats vs upstream (added on our side, removed on our side):"
diff -ruN \
  --exclude='.venv' --exclude='__pycache__' --exclude='*.egg-info' \
  --exclude='*.pyc' --exclude='uv.lock' --exclude='.cache' \
  "$TMP" "$VENDORED" 2>/dev/null \
  | awk '
    /^\+\+\+ |^--- / { in_header=1; next }
    /^@@ /            { in_header=0; next }
    in_header         { next }
    /^\+/             { added++ }
    /^-/              { removed++ }
    END { printf "  +%d / -%d lines (excluding headers/hunk markers)\n", added+0, removed+0 }
  '

echo
echo "Source of truth: UPSTREAM.md §3. Update the divergences table when adding/removing intentional differences."
