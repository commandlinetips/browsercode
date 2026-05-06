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
| 2026-05-01 | `eb7555d3c` | `bad732c26` | bcode | Merged upstream release point for v1.14.25 (`sync release versions for v1.14.25` on `dev`). 73 upstream commits. **Targeted v1.14.25 instead of latest (v1.14.31, 357 commits)** because v1.14.26 introduces a sweeping refactor — `packages/shared` → `packages/core` rename (PR #24309) + Global module move (`packages/opencode/src/global/index.ts` + `packages/shared/src/global.ts` → `packages/core/src/global.ts`) — that needs design discussion before adoption. Splitting into two syncs keeps each one mechanical. Conflicts: `packages/opencode/package.json` (kept `@browser-use/browsercode-core` name, took version bump to 1.14.25), `bun.lock` (took upstream, regenerated via `bun install`), `.github/workflows/publish.yml` (deleted by us per PR #14, upstream modified — kept our deletion). Yellow-zone audit (4 files: `cli/cmd/tui/app.tsx`, `config/config.ts`, `installation/index.ts`, `session/session.ts`): all auto-merged cleanly, BrowserCode customizations (USER_AGENT, `bcode.sh` URLs, `.bcode` paths, BCODE_UPGRADE_DISABLED block, doc-string overrides) verified present. **Notable upstream change pulled in:** PR #23244 — tool framework + all 18 built-in tools migrated from Zod to Effect Schema. Required adapting our Level-1 `packages/bcode-browser/src/browser-execute.ts` (`z.object` → `Schema.Struct`, `z.infer` → `Schema.Schema.Type`) and Level-2 adapter `packages/opencode/src/tool/browser-execute.ts` (drop `z` import, use `Schema.Schema.Type` for args). Filtered typecheck: 5/5 passed. Next sync should target v1.14.26+ with the shared→core rename as a documented integration step. |
| 2026-05-01 | `bad732c26` | `af3998c8a` | bcode | Merged upstream release point for v1.14.26 (`sync release versions for v1.14.26` on `dev`). 72 upstream commits. **`packages/shared` → `packages/core` refactor.** PR #24309 renamed the directory + npm package (`@opencode-ai/shared` → `@opencode-ai/core`), purely mechanical (166 files, 218/218 lines, all import-string swaps). Five followup commits relocated modules into the new `packages/core/`: Global (from both `packages/opencode/src/global/index.ts` and `packages/shared/src/global.ts` consolidated into `packages/core/src/global.ts`), cross-spawn-spawner, npm service, and effect/util siblings (logger, runtime, observability, memo-map, log, opencode-process). BrowserCode integration: ported single-string divergence `app = "bcode"` from both deleted Global files into the new `packages/core/src/global.ts`; **dropped CACHE_VERSION cache-bust mechanism verbatim with upstream** — confirmed unused for BrowserCode (never bumped, no consumer depends on the wipe; investigated upstream/dev to confirm intentional removal); updated `browser-execute.ts` import `@/global` → `@opencode-ai/core/global` and trimmed CACHE_VERSION reference from comment. Conflicts: `.github/workflows/review.yml` (kept our deletion), `bun.lock` (regenerated), `packages/opencode/package.json` (kept name, bumped to 1.14.26), `packages/opencode/src/agent/agent.ts` (hunk 1 auto-merged: kept browser-sessions whitelist + took upstream's `_ctx`→`ctx` rename; hunk 2 resolved by keeping `.bcode/plans` and adopting upstream's `ctx.worktree`), `packages/opencode/src/global/index.ts` + `packages/shared/src/global.ts` (deleted with upstream). Filtered typecheck: 5/5 passed. |
| 2026-05-01 | `af3998c8a` | `21f8027ef` | bcode | Merged upstream release point for v1.14.31 (`sync release versions for v1.14.31` on `dev`). 212 upstream commits across v1.14.27–v1.14.31. Conflicts: `.github/workflows/{deploy,publish}.yml` (kept our deletions per PR #14), `bun.lock` (regenerated), `packages/opencode/package.json` (kept name, bumped to 1.14.31), `packages/opencode/src/agent/agent.ts` (kept browser-sessions whitelist + took upstream's new `Global.Path.tmp` whitelist addition — both go in the same `whitelistedDirs` array), `packages/opencode/src/config/config.ts` (kept `bcode.json/bcode.jsonc` filenames + `bcode.sh` config schema URL; adopted upstream's `mergeConfig` helper pattern, retiring `mergeDeep(pipe(...))` chain), `packages/opencode/src/session/session.ts` (kept `.bcode/plans` rename; adopted upstream's new `(input, instance: InstanceContext)` signature using `instance.project`/`instance.worktree`), `packages/opencode/src/installation/index.ts` (substantial restructure — upstream switched from explicit `Service.of({...})` to `result: Interface = {...}` pattern with self-referential method calls; took upstream verbatim as the base, then re-applied 5 BrowserCode divergences: USER_AGENT prefix, `https://bcode.sh/install` URL, `.bcode/bin` execPath check, BCODE_UPGRADE_DISABLED const, early-return guards in `latest`/`upgrade`/`info`). Yellow-zone audit (7 files: `cli/cmd/tui/app.tsx`, `agent.ts`, `config.ts`, `installation/index.ts`, `session.ts`, `index.ts`, `core/src/global.ts`): customizations preserved (`scriptName("bcode")`, banner, USER_AGENT, `bcode.sh`, `.bcode` paths, `app = "bcode"`). Filtered typecheck: 5/5 passed. PR #29 (v1.14.25) supersedes — close in favor of this PR which covers the same window plus three additional release points. |

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
| 2026-05-01 | `660827d` | `013097a` | bcode | 8 upstream commits (PRs #261, #265, #266). `src/browser_harness/daemon.py` (PR #265): split `DevToolsActivePort` into port + ws-path lines and fall back to `ws://127.0.0.1:<port><ws_path>` when `/json/version` returns 404 (Chrome 147+ disables `/json/*` HTTP discovery on the default user-data-dir). `src/browser_harness/run.py` (PR #266): when no daemon is alive, no local Chrome is listening on 9222/9223 (probed via `/json/version`, not bare TCP), and `BROWSER_USE_API_KEY` is set, auto-bootstrap a cloud daemon. `tests/unit/test_run.py`: 2 new tests for the cloud bootstrap path. PR #261 moved `domain-skills/shopify-admin/` → `agent-workspace/domain-skills/shopify-admin/` upstream — both paths are excluded from the vendored tree per §3, so this rename is a no-op for browsercode (`script/check-harness-diff.sh` filters both via `IGNORED_PATHS_REGEX`). All in protected `src/browser_harness/*.py` + tests — taken verbatim. Smoke test + 23 unit tests pass. Divergences touched: none. |
| 2026-05-03 | `013097a` | `59a166f` | bcode | 62 upstream commits. **Helper additions** (PRs #258, #279): `helpers.py` adds `fill_input` (raises on missing element, optional timeout for SPA rendering, dispatches select-all without char event so Cmd/Ctrl+A fires on macOS), `wait_for_element` (prefers `checkVisibility`, falls back to computed style), `wait_for_network_idle`. `tests/unit/test_helpers.py`: +253 lines covering the new helpers. `daemon.py`: discover Dia browser profile on macOS. **Windows IPC hardening** (PR #276): `_ipc.py` adds ping handshake, token auth, atomic port file. **Domain-skills opt-in** (PR #274): `helpers.py` gates auto-injected domain skills behind `BH_DOMAIN_SKILLS=1` (default off). Aligns upstream default with browsercode's exclusion policy — no behavior change for us, but the `BH_DOMAIN_SKILLS` env name is now the canonical knob if we ever decide to ship a curated set. **Cloud bootstrap opt-in** (PR #277): `run.py` makes cloud auto-bootstrap opt-in via `BU_AUTOSPAWN` instead of triggering on any `BROWSER_USE_API_KEY` presence. Plus admin tweaks (`tests/unit/test_admin.py` +10 lines), doc canonicalization (`README.md`, `SKILL.md`, `install.md`, `interaction-skills/profile-sync.md` PR #280), and new top-level scaffolding: `AGENTS.md` (repo orientation for coding agents), `.github/ISSUE_TEMPLATE/{bug-report,feature-request,config}.yml`, `.github/VOUCHED.td`, `docs/allow-remote-debugging.png`. All non-excluded paths taken verbatim. **Excluded paths** (per §3): 14 new domain-skills directories added upstream (aa, alaska, articulate-rise, bigbang-hr, bilibili, BOSS-zhipin, claude-ai, ctrip, flipkart, ly-com, manus, perplexity, wehotel, plus amazon under top-level `domain-skills/`) — skipped. **Divergence update**: `.gitignore` now also includes upstream's new `.idea/` and `.claude/` entries while preserving our `.venv/`. Smoke test (imports + `--version`) clean. Divergences touched: `.gitignore` (extended, same intent). |
| 2026-05-06 | `59a166f` | `32d8d515e` | bcode | 52 upstream commits. **PID-reuse safety in `restart_daemon`** (PR #294): `admin.py` gains `_process_start_time` (Linux `/proc/<pid>/stat` field 22, macOS `ps -o lstart=`, Windows `GetProcessTimes` via ctypes) + new IPC `identify()` helper. `_ipc.py` hardens `ping` against non-dict/non-positive-pid responses. **`BH_RUNTIME_DIR` / `BH_TMP_DIR` split** (PR #318): `_ipc.py` introduces `BH_RUNTIME_DIR` for the AF_UNIX-sensitive sock/port/pid (104-byte `sun_path` budget) while `BH_TMP_DIR` keeps the long-path-tolerant log/screenshot files. Backward compatible — `BH_RUNTIME_DIR` falls back to `BH_TMP_DIR` then `/tmp`, so our `BH_TMP_DIR=ctx.bhTmpDir` setup in `browser-execute.ts` continues to work unchanged. (Future browsercode improvement: pass `BH_RUNTIME_DIR` separately so a deeper persistent `bhTmpDir` no longer has to fit the AF_UNIX budget. Tracked for ROADMAP follow-up — out of scope for this sync.) **AF_UNIX umask fix** (PR #309): `_ipc.py` sets `umask 0077` around `bind()` to remove the chmod TOCTOU window. **`current_tab` via daemon meta** (PR #305): `helpers.py` resolves the attached `target_id` server-side via the daemon's session meta instead of `Target.getTargetInfo`, fixing the missing-target case after a page nav. **CDP discovery fallback** (PR #292): `daemon.py` falls back to `ws://127.0.0.1:<port><ws_path>` when `/json/version` returns 404 (Chrome 147+ disables `/json/*` on default user-data-dirs); IPv6 hosts bracketed in the WS URL. **Tab-switch CDP parity** (PR #296): `daemon.py` enables Page/DOM/Runtime/Network on `set_session` to match initial-attach behavior; `helpers.py` filters `wait_for_network_idle` events by `session_id` so a previously-attached background tab doesn't poison idle on the current tab. **Run-time CDP precedence** (PR #300): `run.py` adds `_explicit_cdp_configured()` gate so `BU_CDP_URL` / `BU_CDP_WS` block the cloud auto-bootstrap (was silently overriding user's explicit endpoint and billing for a cloud browser). **Browser discovery additions**: Chrome Canary profile (PR #263, macOS + Windows in `daemon.py`), Brave on Windows (PR #284, `daemon.py`). **README banner** (PR #285): SVG ink-bleed reveal replaces the static R2 PNG. **VOUCHED.td** (PRs #308, #310): two bot/fabricated-profile exclusions. **Excluded paths** (per §3): 8 new domain-skills additions upstream (agentlist, browser-use-cloud, freewheel-mrm, tasksquad-ai, vercel, x — across PRs #281, #282, #283, #288, #301, #302) plus shopify-admin reorg/cleanup — skipped. All in-scope files (`src/browser_harness/*.py`, `tests/unit/*.py`, `README.md`, `.github/VOUCHED.td`) taken verbatim. Two new test files: `tests/unit/test_daemon.py`, `tests/unit/test_ipc.py`. Smoke test: imports ok, `browser-harness --version` → `0.1.0`, `pytest tests/unit/` → 76 passed. Divergences touched: none. |

---

## 3. Harness divergences and excluded paths

Per-file record of where `packages/bcode-browser/harness/` deliberately differs from upstream, plus the list of paths excluded from the vendored tree entirely. Read this *before* a sync diff so intentional differences aren't mistaken for missing features and excluded paths aren't accidentally re-imported.

Path-allowlist policy (decisions.md §3.7, §4.5; updated for upstream PR #229 src-layout reorg):

- `agent-workspace/agent_helpers.py` — editable; primary BrowserCode extension surface. Divergences expected.
- `src/browser_harness/*.py` (`daemon.py`, `admin.py`, `helpers.py`, `run.py`, `_ipc.py`) — protected. Pulled verbatim from upstream. If behavior change is needed, upstream a PR to `browser-use/browser-harness`.
- `interaction-skills/` — verbatim from upstream. We never edit these.
- `(agent-workspace/)?domain-skills/` — **excluded.** See "Excluded paths" below.
- Other files (`pyproject.toml`, `LICENSE`, `README.md`, etc.) — divergence allowed but discouraged.

### Excluded paths

Upstream paths the vendored tree treats as if they don't exist. Sync agents skip them; the diff checker filters them out. The runtime guard in `helpers.py` (`if d.is_dir():` in `goto_url`) means absence is a clean no-op.

| Pattern | Reason |
|---|---|
| `(agent-workspace/)?domain-skills/**` | User-contributed site recipes. Quality, maintenance, and prompt-injection concerns. Browsercode (cloud-first, performance-focused) curates its own skills server-side; OSS users get the harness without bundled recipes. Both upstream paths covered: post-PR-#229 `agent-workspace/domain-skills/` and the legacy/PR-#247 top-level `domain-skills/`. The exclusion is enforced in three places that all reference this row: `script/check-harness-diff.sh` (`IGNORED_PATHS_REGEX`), `harness-sync.md` step 5 ("Excluded paths" row), and the absence of these directories from the vendored tree. |

### Modified files

| File | Section | Direction | Reason |
|---|---|---|---|
| `.gitignore` | venv entry | added `.venv/` | smoke-test workflow creates `.venv/` in the harness dir; we ignore it. Upstream uses CWD-level venv so doesn't need this. |

The vendored harness's `SKILL.md`, `README.md`, and `install.md` reference `agent-workspace/domain-skills/`, but we keep them verbatim from upstream. Rationale:

- `README.md` and `install.md` are not referenced by any browsercode prompt or TS code — the agent never reads them. Their content is dead weight in the extracted cache, not agent-visible.
- `SKILL.md` is referenced by `packages/opencode/src/tool/browser-execute.txt` today, but the long-term plan (see ROADMAP) is to replace that pointer with a browsercode-owned prompt file, making vendored `SKILL.md` inert too.
- Trimming these files would generate per-sync drift forever for zero agent-behavior benefit. Keeping them verbatim costs nothing and keeps future syncs mechanical.

---

## Drift checker

Run `script/check-upstream.sh` to see whether we're behind either upstream. It reads the latest `To SHA` from each §2 table and reports "N commits behind" since that point.

Required remotes:

```sh
git remote add upstream https://github.com/anomalyco/opencode.git
git remote add harness  https://github.com/browser-use/browser-harness.git
```
