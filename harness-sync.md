# Harness sync protocol

How to pull `browser-use/browser-harness` into `packages/bcode-browser/harness/`. For opencode upstream sync see `opencode-sync.md`; the two flows are deliberately separate and not run together.

## Why this is different from opencode-sync

- **Drift is acceptable, sometimes preferable.** We are not staying in lockstep — we are an opencode-flavored fork of the harness. Sync when we want their improvements, ignore when we don't.
- **No git merge.** The harness is small (~5 source files + skill markdown). Vendor by plain copy. No subtree, no submodule, no merge commits inside the subtree. Conflicts are reasoned about file-by-file by the agent, not resolved by git.
- **No typecheck step.** The harness is Python. Smoke test instead.

## Prerequisites

- `harness` remote configured: `git remote add harness https://github.com/browser-use/browser-harness.git`. Idempotent: `git remote get-url harness >/dev/null 2>&1 || git remote add harness https://github.com/browser-use/browser-harness.git`.
- `$BROWSERCODE_DEV_PAT` available (for push + PR creation).
- `uv` on `PATH` for the smoke test.

## The 7 steps

### 1. Start clean on `main`

```sh
git checkout main
git pull origin main
```

### 2. Read the current state

Two things to read before touching anything:

- **`UPSTREAM.md`** — the latest `To SHA` row under `### browser-use/browser-harness`. That is the last commit we synced to. It is the only source of truth for "what version is vendored."
- **`UPSTREAM.md` §3 Harness divergences** — the table of files where we deliberately differ from upstream, with reasons. Read this *before* the diff so you know which differences are intentional and not "missing features."

If the divergences table is empty (initial vendor state), every difference between us and upstream is unintentional drift; flag any in the PR.

### 3. Check drift

```sh
script/check-upstream.sh         # commit count: how many commits behind
script/check-harness-diff.sh     # file-level diff vs harness/main, with known-divergence filter
```

`check-upstream.sh` reports how many commits `harness/main` is ahead of our recorded `To SHA`. `check-harness-diff.sh` shows per-file differences between our vendored tree and `harness/main`, splitting them into "known divergences (UPSTREAM.md §3)" and "unexpected drift" — the latter should always be either (a) commits we haven't synced yet, or (b) a Yellow-zone modification we forgot to record. Anything else is a bug.

Then inspect what changed:

```sh
git fetch harness main
git log --oneline <recorded-sha>..harness/main
git diff <recorded-sha>..harness/main
```

The diff is the input to step 5.

### 4. Create the sync branch

```sh
git checkout -b sync/harness-<short-sha> main
```

`<short-sha>` is the first 7 chars of the harness commit you are syncing to (typically `harness/main` HEAD).

### 5. Apply changes file-by-file

This is where the agent earns its keep. For each file changed in `<recorded-sha>..harness/main`:

| File category | Action |
|---|---|
| Files not in our divergences table (incl. `src/browser_harness/*.py`, `agent-workspace/domain-skills/`, `interaction-skills/`, `tests/`, `pyproject.toml`, `LICENSE`, etc.) | Take upstream verbatim — `cp temp/browser-harness/<path> packages/bcode-browser/harness/<path>`. |
| Files in our divergences table | Read each upstream hunk. For each, decide: **take** (apply upstream change to our file), **skip** (our divergence wins, ignore upstream change), or **adapt** (rewrite our divergence to coexist with the upstream change). Update the divergences row if its reason or scope shifts. |
| New upstream files | Copy in. |
| Files we have but upstream removed | Decide: keep ours (record in divergences) or delete. |

Path-allowlist policy stays in force during sync resolution as well as normal development:
- `agent-workspace/agent_helpers.py` — editable, agent's primary extension surface (post PR #229).
- `src/browser_harness/*.py` (`daemon.py`, `admin.py`, `helpers.py`, `run.py`, `_ipc.py`) — protected. Always take upstream verbatim. If upstream regresses, file an issue at `browser-use/browser-harness` and pin to the prior SHA, do not patch locally.

### 6. Smoke test

```sh
cd packages/bcode-browser/harness
uv run python -c "from browser_harness import run, helpers, daemon, admin, _ipc; print('imports ok')"
uv run browser-harness --version
```

The first line verifies the package builds, deps resolve, and the core modules import. The second exercises the console-script entry point we invoke from `browser-execute.ts`. We don't try to start the daemon here — that needs a real Chrome and is covered by integration tests, not the sync workflow.

### 7. Update UPSTREAM.md

Append a row to the sync-log table under `### browser-use/browser-harness`:

```
| YYYY-MM-DD | <from-sha> | <to-sha> | <author> | N upstream commits. Files updated: <list>. Divergences touched: <list or none>. |
```

If divergences were added/adapted/removed in step 5, update the §3 divergences table in the same commit.

### 8. Commit, push, PR

```sh
git add .
git commit -m "sync: harness <short-sha>"
git push -u origin sync/harness-<short-sha>
```

Open the PR via REST (same constraint as opencode-sync — `gh pr create` GraphQL is blocked by the fine-grained PAT):

```sh
curl -sS -X POST \
  -H "Authorization: token $BROWSERCODE_DEV_PAT" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/browser-use/browsercode/pulls \
  -d '{
    "title": "sync: harness <short-sha>",
    "head": "sync/harness-<short-sha>",
    "base": "main",
    "body": "<PR body — see template below>"
  }'
```

### PR body template

```
## Summary
Brings browser-use/browser-harness up to <to-sha>. N upstream commits since <from-sha>.

## Files updated
- `helpers.py` — <one-line summary of upstream changes>
- `domain-skills/<site>/...` — <added/changed by upstream>
- ...

## Divergences
- (no change) / (added: <file> — <reason>) / (adapted: <file> — <new reason>) / (removed: <file> — <reason>)

## Verification
- Smoke test: clean
```

## Never push directly to `main`

Same project rule: branch + PR. Merging the sync PR is a human decision.

## Troubleshooting

- **Massive churn (e.g. upstream rewrote `daemon.py`)** — stop and ask. A sweeping refactor in the protected zone may need an integration design conversation, not a mechanical sync.
- **Smoke test fails on import** — a dep changed in `pyproject.toml`. Bump the bootstrap manifest (ROADMAP A3) in the same PR if the fix is small; otherwise revert the dep change and pin to the prior SHA.
- **Upstream removed a divergence we depend on** — record it as a kept divergence in the table with rationale, and consider opening an upstream PR that re-adds the surface as a hook (decisions.md §1c upstreaming heuristic applies here too).
