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

Goal: cut visible "opencode" leaks before the user installs locally for the first time. Operating principle: **no users yet, so do the rename clean rather than ship a migration layer**. Anything that would have needed a backwards-compat migration path was simplified to "just use the new name."

### Renames

| File | Change | Reason | Upstream-able? |
|---|---|---|---|
| `packages/opencode/src/global/index.ts` | XDG app name `opencode` → `bcode`. **No** legacy migration: just resolve to `~/.config/bcode/` etc. Cleaner code than the migration shim added in the previous draft. | Brand. No users on the binary yet — backwards-compat shim is unjustified maintenance debt. | No. |
| `packages/shared/src/global.ts` | Same XDG app name change in the parallel Effect-service `Global`. | Brand. Mirror. | No. |
| `packages/opencode/src/server/routes/control/index.ts` | OpenAPI `info.title`/`info.description`: `"opencode"` → `"bcode"`. | Brand. Visible at `GET /doc`. | No. |
| `packages/app/index.html` | `<title>OpenCode</title>` → `<title>BrowserCode</title>`. | Brand. Embedded web UI. | No. |
| `packages/opencode/src/storage/db.ts`, `packages/opencode/src/index.ts`, `packages/opencode/test/storage/db.test.ts` | DB filename `opencode.db` → `bcode.db`. | Brand. No users → no migration needed. | No. |
| `packages/opencode/src/config/config.ts`, `packages/opencode/src/cli/cmd/mcp.ts`, `packages/opencode/src/cli/cmd/tui/config/tui-migrate.ts` | Project config filename `opencode.json`/`opencode.jsonc` → `bcode.json`/`bcode.jsonc`. Global config filename same. | Brand. User-facing convention; users will put `bcode.json` in their projects. | No. |
| 14 files across `src/config/`, `src/agent/`, `src/cli/cmd/`, `src/session/`, `src/plugin/`, `src/file/`, `src/cli/cmd/tui/` | Project subdir `.opencode/` → `.bcode/` (covers `.opencode/agent/`, `.opencode/command/`, `.opencode/plans/`, `.opencode/themes/`, `.opencode/tui.json`, `.opencode/bin/`, etc.). | Brand. User-facing convention. The 14-file blast radius is the cost of upstream not having an extension point for "what's the project subdir name?" — every path that hardcoded `.opencode` had to flip. | **Maybe** — upstream could expose the project-subdir name as a single constant. Worth proposing if F7 follow-ups grow. |
| 33 theme `*.json` files in `src/cli/cmd/tui/context/theme/` | `$schema: "https://opencode.ai/theme.json"` → `"https://bcode.sh/theme.json"`. | Brand. The schema doesn't actually exist at our domain yet (gated on bcode.sh landing), but neither does it at opencode.ai for our forked schema; this is just the URL pointer. Mechanical sweep, no logic change. | No. |
| `packages/opencode/src/config/config.ts` (4 sites) | Auto-injected `$schema: "https://opencode.ai/config.json"` on user config files → `"https://bcode.sh/config.json"`. | Same as above, but for user-level `bcode.json`. | No. |
| `packages/opencode/src/cli/cmd/tui/config/tui-migrate.ts` | `TUI_SCHEMA_URL` `opencode.ai/tui.json` → `bcode.sh/tui.json`. | Same. | No. |
| `packages/opencode/src/cli/cmd/uninstall.ts` | "Uninstall OpenCode" banner → "Uninstall BrowserCode". `# opencode` shell comment marker + `.opencode/bin` PATH detection → `# bcode` + `.bcode/bin`. "Thank you for using OpenCode" → "BrowserCode". | Brand. The shell-cleanup logic is wired to whatever string our future install script emits; renaming is correct. | No. |

### LLM provider headers (`packages/opencode/src/provider/provider.ts`, 7 sites)

User question on the prior pass: "would changing to bcode.sh really make much of a difference?" Verdict: **no**, change all of them. Justification:

- `HTTP-Referer`, `X-Title`, `X-Source` are *attribution* headers — used for analytics and (on OpenRouter) for routing to a registered app page. They are not authentication, not part of User-Agent (already `browsercode/...`), and not in the Red-zone provider-trust set.
- Sending `opencode.ai` from a BrowserCode binary is impersonation: it credits OpenCode's account/analytics for our traffic. That's wrong even if it currently works.
- `bcode.sh` doesn't resolve yet, but neither does `opencode.ai/[unregistered-bcode]` — neither URL is doing anything useful for a BrowserCode user. Switching to `bcode.sh` is correct labelling now and lights up automatically when we register the domain.
- OpenRouter rate-limits / featured-app placement attached to OpenCode's referer are *not* something BrowserCode should inherit by impersonation.

| File | Lines | Change | Upstream-able? |
|---|---|---|---|
| `provider/provider.ts` | 7 sites (llmgateway, openrouter, nvidia, vercel, zenmux, kilo, cerebras 3rd-party-integration) | `"https://opencode.ai/"` → `"https://bcode.sh/"`; `"opencode"` → `"bcode"` in `X-Title`/`X-Source`/`X-Cerebras-3rd-Party-Integration`. | **Maybe** — upstream could expose attribution headers as a single config block. Tracked for F8. |

### Self-upgrade safety (`packages/opencode/src/installation/index.ts`)

**Critical bug fix.** Upstream's auto-upgrade flow runs on every startup unless `autoupdate: false` is configured. It detects how the binary was installed (npm/brew/scoop/choco/curl), queries the corresponding upstream registry for "latest opencode-ai version", and runs the package-manager upgrade. **On a BrowserCode binary, this would replace `bcode` with `opencode`** — silent, destructive, and would happen on the user's first run of v0.0.2.

| File | Change | Reason | Upstream-able? |
|---|---|---|---|
| `installation/index.ts` | Added `BCODE_UPGRADE_DISABLED = true` flag. `latest()` short-circuits to `InstallationVersion` (so the auto-upgrade in `cli/upgrade.ts:8` sees `latest === current` and bails on the existing line 20 check). `upgrade()` short-circuits to `UpgradeFailedError({ stderr: "BrowserCode auto-upgrade is not yet supported. Download from <github releases> or rebuild from source." })`. The npm/brew/scoop/choco lookup logic is left in place as dead code — removing it is a larger refactor and would conflict on every upstream sync. | The auto-upgrade was a foot-gun, not a deferred feature. Disabling it is the only safe shape until BrowserCode ships its own update infrastructure (C1 + a release feed). | No (BrowserCode-specific). |
| `installation/index.ts` | Same file: also flipped `https://opencode.ai/install` → `https://bcode.sh/install` in `upgradeCurl()`. Dead code path now (the new BCODE_UPGRADE_DISABLED flag returns before this is reached), but `bcode.sh/install` will be the right answer when we re-enable auto-upgrade. | Brand + future-proofing. | No. |
| `cli/cmd/upgrade.ts` | "opencode is installed to..." messages → "bcode is installed to...". | Brand. | No. |

### MCP OAuth client identity (`packages/opencode/src/mcp/oauth-provider.ts`)

| File | Change | Reason | Upstream-able? |
|---|---|---|---|
| `mcp/oauth-provider.ts` | `client_uri: "https://opencode.ai"` → `"https://bcode.sh"`. | This is sent to MCP servers during OAuth client registration as the canonical app URL. Same justification as the provider attribution headers above. | No. |

### Default system prompts (`packages/opencode/src/session/prompt/{default,anthropic}.txt`)

| File | Change | Reason | Upstream-able? |
|---|---|---|---|
| `prompt/anthropic.txt`, `prompt/default.txt` | "You are OpenCode/opencode" → "You are BrowserCode". GitHub feedback URL `anomalyco/opencode` → `browser-use/browsercode`. "use WebFetch on opencode.ai/docs" → "point at BrowserCode README; OpenCode features still apply for generic ones". | The prompt instructs the LLM about its own identity and how to answer self-referential questions. A BrowserCode binary should not introduce itself as OpenCode or send users to OpenCode's docs site for BrowserCode-specific questions. The new wording acknowledges the OpenCode lineage explicitly so the agent doesn't get confused when users ask about OpenCode features. | No. |

### Misc small touch-ups

| File | Change | Reason |
|---|---|---|
| `packages/opencode/src/cli/cmd/tui/app.tsx` | Open `https://opencode.ai/docs` (TUI keybind) → `https://github.com/browser-use/browsercode`. | Same as default prompt change. |
| `packages/opencode/src/cli/cmd/tui/feature-plugins/home/tips-view.tsx` | Tip "Run /share to create a public link to your conversation at opencode.ai" → "...requires the share service to be configured". | The opencode.ai share service isn't ours; mentioning it as if it Just Works in BrowserCode is wrong. |
| `packages/opencode/src/config/config.ts` (2 doc-string sites) | Schema descriptions for `command` / `agent`: extended to mention BrowserCode README first, OpenCode docs as upstream reference. | Brand + lineage acknowledgment. |

## Deliberately NOT changed in F7 medium pass

These remain on the deferred list. Most are gated on product calls or are dead/inactive code paths in the compiled binary.

| Surface | Why deferred |
|---|---|
| `packages/opencode/src/cli/cmd/github.ts` (4 sites: `api.opencode.ai/get_github_app_installation`, `dev.opencode.ai`, `opencode.ai`, `opencode.ai/docs/github`) | The `bcode github` subcommand is wired to the OpenCode GitHub App as a complete feature (PR comment-driven agent runs). BrowserCode doesn't have an equivalent App. Disabling the subcommand or rewiring it is its own ticket. The URLs only resolve when a user runs `bcode github ...`, which they won't until we ship a BrowserCode equivalent. |
| `packages/opencode/src/cli/cmd/tui/component/dialog-go-upsell.tsx`, `dialog-provider.tsx` | Upsell dialogs for OpenCode's paid tiers (`opencode.ai/go`, `opencode.ai/zen`). Only shown when a user picks "OpenCode" or "OpenCode Go" as a provider in the model picker. Removing the OpenCode provider entirely is a bigger product call (do we leave it as a usable provider for users who have OpenCode keys?). |
| `packages/opencode/src/cli/cmd/providers.ts` (`opencode.ai/auth`, Cloudflare gateway docs URL) | Same as above — shown when adding OpenCode as a provider. |
| `packages/opencode/src/server/routes/ui.ts` (`app.opencode.ai` proxy fallback) | Dead path in compiled binaries — only used when the embedded UI bundle is missing. |
| `packages/opencode/src/plugin/codex.ts`, `mcp/oauth-callback.ts` (HTML `<title>OpenCode - …`) | Visible only during OAuth callback flows that 99% of users won't see. Low priority. |
| `packages/opencode/src/ide/index.ts` (`sst-dev.opencode` VS Code extension ID) | Real third-party extension, published by SST. We don't have a BrowserCode equivalent yet. |
| `packages/opencode/src/installation/index.ts` registry-lookup paths (`registry/opencode-ai/*`, `formulae.brew.sh/api/formula/opencode.json`, `api.github.com/repos/anomalyco/opencode/releases/latest`, `npm install -g opencode-ai@*`, etc.) | Dead code now (BCODE_UPGRADE_DISABLED short-circuits before they run). Removing them is a Yellow-zone scope expansion of ~80 lines that doesn't change behavior. Will revisit when BrowserCode has its own update infrastructure. |
| `OPENCODE_*` env vars, `@opencode/...` Effect service IDs, `x-opencode-*` headers, `--user-agent=opencode/...` for third-party providers | **Red zone.** Wire-level identifiers. Never touch. |
