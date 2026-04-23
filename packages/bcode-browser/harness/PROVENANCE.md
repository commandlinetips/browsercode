# browser-harness provenance

Vendored source for the `harness/` subtree.

**Upstream:** https://github.com/browser-use/browser-harness
**Last vendored commit:** _(none yet — harness not vendored; ROADMAP A2)_
**Last vendored date:** —

## Sync log

| Date | From SHA | To SHA | By | Notes |
|---|---|---|---|---|
| — | — | — | — | Not vendored yet. Initial vendor lands in ROADMAP A2. |

## Path-allowlist policy (decisions.md §3.7, §4.5)

Once the harness is vendored, the following holds:

- `harness/helpers.py` — **editable** for BrowserCode needs. Changes are ours to make.
- `harness/daemon.py`, `harness/admin.py` — **protected**. Never modify. Pulled verbatim from upstream. If behavior change needed, upstream a PR to `browser-use/browser-harness`.

## Per-file edit log

Append a row here whenever a vendored file is modified.

| Date | File | Summary | By | Upstream-PR? |
|---|---|---|---|---|
| — | — | — | — | — |
