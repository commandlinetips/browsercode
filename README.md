# BrowserCode

An AI coding agent that drives real browsers. Forks
[anomalyco/opencode](https://github.com/anomalyco/opencode).

## Install

```sh
curl -fsSL https://bcode.sh/install | bash
```

Installs `bcode` to `~/.bcode/bin`. macOS, Linux, and Windows (Git Bash).
Requires Chrome with `chrome://inspect` enabled (or `BU_CDP_WS` set to a
remote CDP endpoint).

## What's different from opencode

- One new tool, `browser_execute(code)`, that runs JavaScript/TypeScript
  in a real browser via CDP. The CDP session persists across calls within
  an agent session.
- Everything else from opencode works the same. Same providers, same TUI,
  same config (`opencode.json`).

## Run from source

```sh
git clone https://github.com/browser-use/browsercode.git
cd browsercode
bun install
bun run --cwd packages/opencode dev
```

Needs `bun >= 1.3.13` plus the runtime prereqs above.

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
- `packages/bcode-browser/` — BrowserCode-specific code: in-process CDP
  harness, `browser_execute` implementation, embedded skills.

## Maintenance docs

- `UPSTREAM.md` — modification zones, sync log.
- `opencode-sync.md` — runbook for syncing from anomalyco/opencode.
- `AGENTS.md` — code style + maintenance notes for agents working in this repo.
- `install.sh` — what `bcode.sh/install` serves.

## Telemetry

BrowserCode sends anonymous usage traces to help improve the project. To opt
out, set `DO_NOT_TRACK=1` in your environment.

## License

MIT. See `LICENSE`.
