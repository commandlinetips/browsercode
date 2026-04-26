# BrowserCode

An AI coding agent that drives real browsers. Forks
[anomalyco/opencode](https://github.com/anomalyco/opencode) and vendors
[browser-use/browser-harness](https://github.com/browser-use/browser-harness).

> Pre-release. No installable artifact yet — clone and run from source.

## What's different from opencode

- One new tool, `browser_execute(python)`, that runs Python against a
  long-lived browser daemon. The daemon connects to your real Chrome via CDP
  and persists across calls within a session.
- Everything else from opencode works the same. Same providers, same TUI,
  same config (`opencode.json`).

## Run from source

Prereqs: `bun >= 1.3.13`, `uv` ([install](https://astral.sh/uv/install.sh)),
Chrome with `chrome://inspect` enabled (or `BU_CDP_WS` pointing at a remote
CDP endpoint).

```sh
git clone https://github.com/browser-use/browsercode.git
cd browsercode
bun install
bun run --cwd packages/opencode dev
```

The first `browser_execute` call builds a Python venv at
`packages/bcode-browser/harness/.venv/` (cold ~15s, warm ~50ms after).

## Configure browser permission

`browser_execute` is enabled by default. To disable or gate it, edit
`opencode.json`:

```jsonc
{
  // disable entirely
  "tools": { "browser_execute": false }

  // or prompt every call
  "permission": { "browser_execute": "ask" }
}
```

## Repo layout

- `packages/opencode/` — vendored from `anomalyco/opencode` (treat as
  upstream; modifications are deliberate exceptions).
- `packages/bcode-browser/` — BrowserCode-specific code:
  - `src/` — `browser_execute` Effect service.
  - `harness/` — vendored from `browser-use/browser-harness`.

## Maintenance docs

- `UPSTREAM.md` — modification zones, sync log against both upstreams.
- `opencode-sync.md` — runbook for syncing from anomalyco/opencode.
- `harness-sync.md` — runbook for syncing from browser-use/browser-harness.
- `AGENTS.md` — code style + maintenance notes for agents working in this repo.

## License

MIT. See `LICENSE`.
