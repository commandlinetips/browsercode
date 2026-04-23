# @browser-use/bcode-browser

Level-1 BrowserCode package: substantial, self-contained code with zero upstream-fork friction.

See `decisions.md §1c` (three-level model) and `§1d` (this package) in the BrowserCode project memory.

## Contents (planned)

| Path | Purpose | Roadmap phase |
|---|---|---|
| `harness/` | Vendored `browser-use/browser-harness` | A2 |
| `src/browser-execute/` | `browser_execute` tool body | A4 |
| `src/fetch-use/` | `FetchUse.Service` implementation | B1 |
| `src/cloud/` | Cloud deploy, skillbase, judge clients | D3–D4 |

Integration into `packages/opencode` (tool registration, service wiring, CLI commands) is Level 2 and lives in `packages/opencode/src`. Per the one-line-hook rule, those hooks are pointers only — all logic lives here.

## Upstream tracking

- `harness/PROVENANCE.md` — source commit SHA + edit log for the vendored harness.
- Root-level `UPSTREAM.md` — sync log across both upstreams (opencode and harness).
