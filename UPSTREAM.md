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

The harness has its own narrower zone policy (see §3 below): `agent-workspace/agent_helpers.py` is editable, the `src/browser_harness/` core package is protected, deliberate divergences are logged per-file.

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
| 2026-04-28 | `216a2c9` | `fefca43` | bcode | 41 upstream commits. **Major restructure** (PR #229): src-layout reorg (`*.py` → `src/browser_harness/*.py`), `domain-skills/` → `agent-workspace/domain-skills/`, agent-editable surface moved from root `helpers.py` to `agent-workspace/agent_helpers.py`, new `_ipc.py` for Windows TCP / POSIX AF_UNIX support, tests moved to `tests/{unit,integration}/`. Also: Expedia/Substack/Loom/Gmail domain skills, screenshot max-dim, helpers.switch_tab dict-accept, websockets pin 15.0.1, BU_CDP_URL, doctor improvements, JS eval refactor. Adapted our integration: `browser-execute.ts` invokes `browser-harness` console-script (not `python run.py`); `harness.ts` `PRESERVED_PATHS` updated to `agent-workspace/agent_helpers.py`; smoke test now imports from `browser_harness` package; `browser-execute.txt` prompt updated to point at new helper paths. Divergences touched: none (still just `.gitignore` + `.venv/`). |
| 2026-04-28 | `fefca43` | `04f7716` | bcode | 7 upstream commits. Windows fixes (PRs #232, #240) + skill rename (PR #242). Files: `src/browser_harness/_ipc.py` (BH_TMP_DIR override for sock/port/pid/log/screenshot dir; drop DETACHED_PROCESS to suppress empty Windows console window), `src/browser_harness/admin.py` (route `ensure_daemon` warm probe through `ipc.connect` so Windows TCP loopback works; new `_open_inspect=False` flag on `ensure_daemon` used by `run_setup` to prevent chrome://inspect tab flooding; drop unused `_paths()` helper), `src/browser_harness/helpers.py` (`capture_screenshot` and click-debug overlay route through `ipc._TMP` instead of `tempfile.gettempdir()` so BH_TMP_DIR covers them too), `SKILL.md` (`name: browser-harness` → `name: browser`), `install.md` (`name: browser-harness-install` → `name: browser-install`). All in protected `src/browser_harness/*.py` zone — taken verbatim. SKILL/install frontmatter rename only affects how end-users invoke the skill (`/browser` vs `/browser-harness`); our `browser-execute.txt` references SKILL.md by file path, so no integration code changes. Divergences touched: none. PR #240 e2e tested separately on Linux against headless Chrome before sync. |
| 2026-04-28 | `04f7716` | `2125cea` | bcode | 1 upstream commit (PR #243). `src/browser_harness/_ipc.py`: `_TMP.mkdir(parents=True, exist_ok=True)` at module load so a caller-supplied `BH_TMP_DIR` pointing at a non-existent directory no longer fails the first sock/port/pid/log/screenshot write. Prerequisite for browsercode's per-session scratch-dir use case. Protected zone — taken verbatim. Divergences touched: none. |
| 2026-04-29 | `2125cea` | `997ee45` | bcode | 6 upstream commits (PRs #241, #244, #245). `src/browser_harness/_ipc.py`: when `BH_TMP_DIR` is set, drop the `bu-<NAME>` filename prefix (caller-isolated dir means no shared-tmpdir disambiguation needed); without `BH_TMP_DIR` the original `bu-<NAME>` scheme is unchanged. `src/browser_harness/admin.py`: `_daemon_endpoint_names` short-circuits to the local NAME when `BH_TMP_DIR` is set (no glob); plus catch `SystemError` from `os.kill` on Windows during `restart_daemon`. `src/browser_harness/daemon.py`: discover DevToolsActivePort in Comet and Arc profiles on macOS. `tests/unit/test_admin.py`: 2 new tests for the `BH_TMP_DIR` discovery path. All in protected `src/browser_harness/*.py` + tests — taken verbatim. Smoke test + 12 admin unit tests pass. The `_ipc` filename change pairs with our recent per-session BH_TMP_DIR work (browsercode PR #22) — caller isolation now extends to filenames as well as the dir. Divergences touched: none. |
| 2026-04-30 | `997ee45` | `660827d` | bcode | 11 upstream commits (PRs #246, #247, #251, #254, #256, #260). `src/browser_harness/daemon.py`: resolve WS via `/json/version` to avoid stale `DevToolsActivePort` path (PR #260) + report `cdp_disconnected` on stale CDP probe in `connection_status` (PR #254) + cleanup remote browser when daemon startup fails (PR #251). `src/browser_harness/admin.py`: companion changes for the daemon fixes. `tests/unit/test_admin.py`: 7 new tests. New domain skills: `agent-workspace/domain-skills/xiaohongshu/scraping.md` (PR #246), and a top-level `domain-skills/shopify-admin/` tree (PR #247: README, embedded-apps, knowledge-base, polaris-inputs). Note: PR #247 added skills at the top-level `domain-skills/` path, not under `agent-workspace/domain-skills/` as the post-#229 layout would suggest — vendored verbatim to match upstream layout. Doc updates: README operator framing (PR #255), install.md heredoc → `-c` flag (PR #256), profile-sync.md same. All files outside divergences — taken verbatim. Smoke test + 19 admin unit tests pass. Divergences touched: none. |

---

## 3. Harness divergences

Per-file record of where `packages/bcode-browser/harness/` deliberately differs from upstream. Read this *before* a sync diff so intentional differences aren't mistaken for missing features.

Path-allowlist policy (decisions.md §3.7, §4.5; updated for upstream PR #229 src-layout reorg):

- `agent-workspace/agent_helpers.py` — editable; primary BrowserCode extension surface. Divergences expected.
- `src/browser_harness/*.py` (`daemon.py`, `admin.py`, `helpers.py`, `run.py`, `_ipc.py`) — protected. Pulled verbatim from upstream. If behavior change is needed, upstream a PR to `browser-use/browser-harness`.
- `interaction-skills/`, `agent-workspace/domain-skills/` — verbatim from upstream. We never edit these.
- Other files (`pyproject.toml`, `LICENSE`, `README.md`, etc.) — divergence allowed but discouraged.

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
