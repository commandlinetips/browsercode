# Exceptions

Per-file log of every Yellow-zone modification BrowserCode makes to upstream `anomalyco/opencode` source. Each entry: what we changed, why, and whether it could become an upstream extension point (decisions.md §1c, ROADMAP F8).

Yellow-zone modifications are merge-conflict candidates on every upstream sync. Keep them surgical. Prefer Green-zone additions or upstream PRs whenever possible.

Format:

| File | Lines (approx) | Change | Reason | Upstream-able? |
|---|---|---|---|---|

Subscript convention for "Upstream-able?":
- **No** — BrowserCode-specific brand/behavior; upstream would not accept.
- **Maybe** — could be restructured as an extension point. Worth proposing.
- **PR <link>** — proposed upstream. Track until merged or rejected.

---

## Phase 2 rebrand (commit `866a1a907`)

| File | Lines | Change | Reason | Upstream-able? |
|---|---|---|---|---|
| `packages/opencode/package.json` | name + bin | `opencode` → `@browser-use/browsercode-core`, `bin: { bcode }` | Brand rename. | No. |
| `packages/opencode/src/cli/cmd/tui/component/banner.tsx` (or wherever banner lives) | banner art | OpenCode wordmark → BrowserCode wordmark | Brand. | No. |
| `packages/opencode/src/installation/index.ts` | USER_AGENT | `opencode/...` → `browsercode/...` | First-party UA. Provider UAs are Red — untouched. | No. |
| `packages/opencode/src/cli/cmd/tui/component/dialog-go-upsell.tsx` (etc.) | upsell strings | Neutralized "opencode.ai/go" upsell | We're not on the opencode.ai paid tier. | No (BrowserCode product call). |
| `packages/opencode/src/server/server.ts` (mDNS) | domain | `opencode.local` → `bcode.local` | Brand. | No. |
| Various `describe:` / `description:` strings in CLI + API routes | doc strings | "OpenCode X" → "BrowserCode X" | Brand. | No. |

## Phase 3 banner redesign (commit `0c7b5e6c8`)

| File | Lines | Change | Reason | Upstream-able? |
|---|---|---|---|---|
| `packages/opencode/src/cli/ui.ts` | non-TTY wordmark | OpenCode → BrowserCode | Brand. | No. |
| `packages/opencode/src/cli/logo.ts` | TTY logo | OpenCode → BrowserCode (split layout) | Brand. | No. |

## Phase A — browser-execute (PRs #6 + #7)

| File | Lines | Change | Reason | Upstream-able? |
|---|---|---|---|---|
| `packages/opencode/src/tool/registry.ts` | ~4 lines | Register `BrowserExecute` Level-2 tool | Tool registration is the existing extension point. | No (already the right shape). |
| `packages/opencode/package.json` | 1 line | Workspace dep on `@browser-use/bcode-browser` | Required to use the Level-1 package. | No. |

## Phase C0 — binary distribution (PRs #9 + #10)

| File | Lines | Change | Reason | Upstream-able? |
|---|---|---|---|---|
| `packages/opencode/script/build.ts` | ~5 lines | bin path `opencode` → `bcode`, plumb embedded harness file map into `Bun.build({ files })` | Binary rename + harness embed. The embed plumbing follows upstream's existing `embeddedFileMap` pattern, so adding a second slot is cheap and merge-safe. | **Maybe** — generalizing `Bun.build({ files })` to accept N named bundles via plugin would let other forks register additional embeds without modifying `build.ts`. Not pressing. |

## Phase F7 — phone-home / branding triage (this PR)

Goal: cut the visible-to-end-user phone-home and branding leaks surfaced by the v0.0.1 binary smoke (PROGRESS.md item 33). Medium-depth — easy items only; deeper sweep deferred.

| File | Lines | Change | Reason | Upstream-able? |
|---|---|---|---|---|
| `packages/opencode/src/global/index.ts` | ~10 lines | XDG app name `opencode` → `bcode`. Added one-time `migrateLegacy()` that copies `~/.config/opencode/` → `~/.config/bcode/` (and same for data + state) on first launch when the new dir doesn't exist and the old does. Cache is regenerated, not migrated. | Brand. Migration preserves user sessions/auth/config from a prior `opencode` install. Legacy dir left in place as rollback. | No. |
| `packages/shared/src/global.ts` | 3 lines | Same XDG app name change in the parallel Effect-service `Global` (used by the SDK + a few packages). No migration logic here — that's done once in `packages/opencode/src/global/index.ts` at startup. | Brand. Mirror of the above. | No. |
| `packages/opencode/src/server/routes/control/index.ts` | 3 lines | OpenAPI `info.title` and `info.description`: `"opencode"` → `"bcode"`. | Brand. Visible at `GET /doc`. | No. |
| `packages/app/index.html` | 1 line | `<title>OpenCode</title>` → `<title>BrowserCode</title>`. | Brand. Visible in the embedded web UI tab. | No. |
| `packages/opencode/src/config/config.ts` | 2 lines (1 logical) | Background `@opencode-ai/plugin@<our-version>` install: `log.warn(...)` on failure → `log.debug(...)`. | The fetch is expected to fail in BrowserCode binaries (we publish under non-`@opencode-ai/plugin` versions that don't exist on npm). Demoting to debug keeps stderr clean without dropping the diagnostic. | **Maybe** — cleaner long-term: add a `disablePluginAutoInstall` config knob upstream. Not worth the latency now. |
| `packages/opencode/src/index.ts` | 1 line | Startup log message `Log.Default.info("opencode", ...)` → `"bcode"`. | Brand. Visible in `~/.local/share/bcode/log/`. | No. |

## Deliberately NOT changed in F7 medium pass

These are real OpenCode references but were skipped to keep this PR scoped. Most are low-frequency, behind paid-feature dialogs, or visible only to upstream contributors.

| Surface | Why deferred |
|---|---|
| 33 theme `*.json` files with `$schema: https://opencode.ai/theme.json` | Pure metadata, no runtime effect. Massive diff. Defer to a Phase G theme-schema sweep. |
| `provider.ts` `HTTP-Referer: https://opencode.ai/` (6 sites) | Sent to LLM providers. Changing affects third-party identification — closer to Red than Yellow. Needs product call (do we want providers to identify us as BrowserCode at the referer level?). |
| TUI dialog upsells — `opencode.ai/zen`, `opencode.ai/go`, `opencode.ai/auth`, `opencode.ai/docs` | Tied to OpenCode paid services. Rewriting them needs BrowserCode equivalents (we don't have the matching landing pages yet). Phase F7 deeper sweep. |
| `opencode.ai/install` in `installation/upgrade` curl | Only invoked by `bcode upgrade`. We don't have an install endpoint at `bcode.sh/install` yet (ROADMAP A1 + C4). When we do, swap. |
| `app.opencode.ai` proxy fallback in `server/routes/ui.ts` | Only used when the embedded UI is missing (it isn't, in compiled binaries). Dead-path for v0.0.x. |
| Default-prompt mentions of "opencode docs" | Affects agent behavior — needs careful review. Defer. |
| `mcp/oauth-callback.ts` and `plugin/codex.ts` HTML titles | Only seen during specific OAuth flows. Low frequency. |
| `opencode.db` data file + `.opencode/` project subdir | Renaming requires per-user migration logic (same shape as the XDG migration but per-project). ROADMAP G1 owns it. |
| `OPENCODE_*` env vars, `@opencode/...` Effect service IDs, `x-opencode-*` headers, `OPENCODE_TEST_HOME`, `OPENCODE_PURE`, `OPENCODE_PID` | **Red zone.** Wire-level identifiers. Never touch. |
