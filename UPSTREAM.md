# Upstream

This doc tracks BrowserCode's relationship to its two upstream sources:

1. **anomalyco/opencode** — forked in as the bulk of this repo.
2. **browser-use/browser-harness** — vendored into `packages/bcode-browser/harness/` (planned, ROADMAP A2).

Two sections: **modification zones** (where is it safe to change upstream code?) and **sync log** (when did we last pull each upstream and to what commit?).

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

Modifications to existing upstream source files are allowed when (a) required by a BrowserCode capability that has no hook-level alternative, and (b) recorded in `EXCEPTIONS.md` with a "can we upstream this?" column (ROADMAP F8).

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

---

## 2. Sync log

Each upstream has its own append-only table. Add a row every time you pull.

### anomalyco/opencode → this repo

**Upstream:** https://github.com/anomalyco/opencode
**Upstream branch we track:** `dev` (upstream default)
**Our default branch:** `main`

| Date | From SHA | To SHA | By | Notes |
|---|---|---|---|---|
| 2026-04-20 | — (initial) | `3e8abac6` | user | Mirror push after fork creation. Tagged `baseline/pre-rename`. See `scripts/check-upstream.sh` output for current drift. |

### browser-use/browser-harness → `packages/bcode-browser/harness/`

**Upstream:** https://github.com/browser-use/browser-harness
**In-tree provenance:** `packages/bcode-browser/harness/PROVENANCE.md` (per-file edit log lives there).

| Date | From SHA | To SHA | By | Notes |
|---|---|---|---|---|
| — | — | — | — | Not vendored yet. First row lands with ROADMAP A2. |

---

## Drift checker

Run `scripts/check-upstream.sh` to see whether we're behind either upstream. It reads the latest `To SHA` from each table above and reports "N commits behind" since that point.
