# Upstream

This doc tracks BrowserCode's relationship to its two upstream sources:

1. **anomalyco/opencode** — forked in as the bulk of this repo. Sync runbook: `opencode-sync.md`.
2. **browser-use/browser-harness** — vendored into `packages/bcode-browser/harness/`. Sync runbook: `harness-sync.md`.

The two are deliberately independent — different upstreams, different cadences, different sync mechanisms (merge vs file-copy). One agent pulls one upstream at a time; never both in the same PR.

Sections: **modification zones** (where is it safe to change upstream code?), **sync log** (when did we last pull each upstream and to what commit?), **harness divergences** (per-file deliberate-deltas list, used during harness sync).

---

## 1. Modification zones

Every line of upstream code falls into one of three zones.

### Red — never touch

Wire-level or brand-level identifiers that would break upstream compatibility:

- `@opencode-ai/*` package names.
- `@opencode/ServiceName` Effect service IDs.
- `x-opencode-*` wire headers.
- `OPENCODE_*` environment variables.
- Third-party provider User-Agents (Anthropic, OpenAI, etc.).

These are contractual with upstream and with provider APIs. Renaming breaks compatibility, auth flows, or provider trust.

### Yellow — touch, but log it

Modifications to existing upstream source files are allowed when (a) required by a BrowserCode capability that has no hook-level alternative, and (b) recorded in the maintainer-side `memory/browsercode/EXCEPTIONS.md` (lives outside this repo, with the agent's roadmap and decisions docs) with a "can we upstream this?" column (ROADMAP F8).

Current Yellow modifications (landed in the rebrand commit `866a1a9`):

- CLI `scriptName` → `bcode`
- Binary/bin rename
- USER_AGENT prefix
- mDNS domain
- Banner/wordmark
- Package name at root (`@browser-use/browsercode`)
- API description strings

Future Yellow modifications (per ROADMAP):

- `packages/opencode/src/tool/webfetch.ts` routed through `FetchUse.Service` (B2)
- Core-CLI phone-home triage (F7)

### Green — add freely

- New files under `packages/opencode/src/` that don't collide with upstream paths.
- New packages (cf. `packages/bcode-browser/`, decisions.md §1d).
- Vendored code inside `packages/bcode-browser/` (own tree, zero upstream friction).

Every Yellow modification should be evaluated for conversion to a Green extension point via upstream PR. See decisions.md §1c and ROADMAP F8.

The harness has its own narrower zone policy (see §3 below): `helpers.py` is editable, `daemon.py`/`admin.py` are protected, deliberate divergences are logged per-file.

---

## 2. Sync log

Each upstream has its own append-only table. Add a row every time you pull.

### anomalyco/opencode → this repo

**Upstream:** https://github.com/anomalyco/opencode
**Upstream branch we track:** `dev` (upstream default)
**Our default branch:** `main`
**Runbook:** `opencode-sync.md`

| Date | From SHA | To SHA | By | Notes |
|---|---|---|---|---|
| 2026-04-20 | — (initial) | `3e8abac6` | user | Mirror push after fork creation. Tagged `baseline/pre-rename`. |
| 2026-04-23 | `3e8abac6` | `eb7555d3c` | bcode | Merged upstream release point for v1.14.22 (`sync release versions for v1.14.22` on `dev`). Conflicts: `packages/opencode/package.json` (kept `@browser-use/browsercode-core`, took version bump to 1.14.22), `bun.lock` (took upstream, regenerated via `bun install`). No Yellow-zone files touched by upstream in this window. |

### browser-use/browser-harness → `packages/bcode-browser/harness/`

**Upstream:** https://github.com/browser-use/browser-harness
**Upstream branch we track:** `main`
**Runbook:** `harness-sync.md`

| Date | From SHA | To SHA | By | Notes |
|---|---|---|---|---|
| 2026-04-26 | — (initial) | `216a2c9` | bcode | Initial vendor at A2. Verbatim copy of `browser-use/browser-harness@216a2c9`. No divergences yet. |

---

## 3. Harness divergences

Per-file record of where `packages/bcode-browser/harness/` deliberately differs from upstream. Read this *before* a sync diff so intentional differences aren't mistaken for missing features.

Path-allowlist policy (decisions.md §3.7, §4.5):

- `helpers.py` — editable; primary BrowserCode extension surface. Divergences expected.
- `daemon.py`, `admin.py` — protected. Pulled verbatim from upstream. If behavior change is needed, upstream a PR to `browser-use/browser-harness`.
- `interaction-skills/`, `domain-skills/` — verbatim from upstream. We never edit these.
- Other files (`run.py`, `pyproject.toml`, `LICENSE`, `README.md`, etc.) — divergence allowed but discouraged.

| File | Section | Direction | Reason |
|---|---|---|---|
| `.gitignore` | venv entry | added `.venv/` | smoke-test workflow creates `.venv/` in the harness dir; we ignore it. Upstream uses CWD-level venv so doesn't need this. |

---

## Drift checker

Run `script/check-upstream.sh` to see whether we're behind either upstream. It reads the latest `To SHA` from each §2 table and reports "N commits behind" since that point.

Required remotes:

```sh
git remote add upstream https://github.com/anomalyco/opencode.git
git remote add harness  https://github.com/browser-use/browser-harness.git
```
