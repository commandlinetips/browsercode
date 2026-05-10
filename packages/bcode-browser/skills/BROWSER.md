# BROWSER.md — driving a real browser with `browser_execute`

Use the `browser_execute` tool to run JavaScript against a connected browser via the Chrome DevTools Protocol. The snippet runs in-process; `session` is bound to a long-lived CDP `Session` that persists across calls within the same bcode session. You connect once, drive many.

**Locations:**

- Workspace (read/write your reusable scripts): `<projectRoot>/.bcode/agent-workspace/`. The bcode CLI runs from the project root, so `./.bcode/agent-workspace/foo.ts` works directly with the `read`/`write`/`edit` tools.
- Skills (read-only reference docs): `{{SKILLS_DIR}}/`. Run `read {{SKILLS_DIR}}/interaction-skills/` to list every available interaction skill before reading any one of them.

## The model in one paragraph

`browser_execute` evaluates whatever JS you write against `session`. There is no auto-loaded library, no privileged file, no helper namespace — just `session` and standard JS globals. To reuse code from a previous snippet, save it as a `.ts` file under `./.bcode/agent-workspace/` (using the `write` tool) and `await import("/abs/path?t=" + Date.now())` it from a later snippet. The import takes an **absolute** path — construct it from `process.cwd()` inside the snippet. Same mechanism for a 5-line wrapper and a 500-line script. Skills under `{{SKILLS_DIR}}/` are documentation you `read`, not modules you `import` — they teach you the CDP patterns; you write the code.

## Connecting

You always call `session.connect(...)` once at the start of your work. The `Session` is fresh on the first `browser_execute` call of an opencode session; subsequent calls reuse it. Three connection methods, in order of preference for typical tasks.

For most tasks where the agent acts on behalf of the user in their normal browser, use **Way 1**. For automation that runs without the user watching, or any case where popup interruptions are unacceptable, use **Way 2** or a cloud browser. Cloud is only used when the user opts in.

**Preconfigured environments (eval harnesses, CI).** If `BU_CDP_WS` (or its alias `BU_CDP_URL`) is set in the environment, `session.connect()` with no args connects to that endpoint directly — no OS scan, no cloud provision. The harness has already chosen the browser for you; just call `await session.connect()` and start driving. Explicit `{ wsUrl }` / `{ profileDir }` calls ignore the env var.

**Way 1 — connect to the user's running Chrome (real profile, popup-gated).** Inherits the user's everyday Chrome logins, extensions, history, and bookmarks. Right choice when the task involves the user's actual logged-in sites.

```js
// Auto-detect the most-recently-launched Chrome with remote debugging enabled.
await session.connect()
```

For this to work the user must have, **once**, navigated to `chrome://inspect/#remote-debugging` in their target Chrome and ticked "Allow remote debugging for this browser instance". This setting is per-profile and sticky: tick it once and it persists across every future Chrome launch of that profile. On Chrome 144 and later, the first attach also triggers an in-browser "Allow remote debugging?" popup that the user must click Allow on. The popup may reappear on later attaches under conditions that are not fully characterized — daemon restart, browser restart, time elapsed, version-dependent options like "Allow for N hours" — so be ready to ask the user to click Allow again if a previously working connection starts 403'ing.

Failure modes and what they mean:

- **`connect()` throws "No running browser with remote debugging detected"** — the checkbox at `chrome://inspect/#remote-debugging` has not been ticked in any running Chrome profile, or no Chrome is running. Ask the user to open their target Chrome and tick the box.
- **`connect()` throws with "403" / "permission" / "WS closed before open"** — the checkbox is ticked but the user hasn't clicked Allow on the popup yet. By default `connect()` errors fast (5s per candidate). To wait up to 30s for the click: pass `{ profileDir: "<abs path to user's profile>", timeoutMs: 30000 }`. Passing `profileDir` skips the OS scan and reads the WebSocket URL straight from `<profileDir>/DevToolsActivePort`. Note: this works for Way 1 (the user's existing profile) on every Chrome version including 144+. For Way 2 (a fresh profile launched with `--user-data-dir`), Chrome 147+ has been observed to not write this file — see Way 2 below for the `/json/version` route.

**Way 2 — connect to a Chrome you (or the user) launched with a debug port (isolated profile, no popups, ever).** Right choice for unattended automation, or whenever popup interruptions are unacceptable.

Launch Chrome with `--remote-debugging-port=<port> --user-data-dir=<path>`. Pick any path the agent's tools can write to — a project-local directory like `./.bcode/way2-chrome` is a safe default; `/tmp/...` works wherever the sandbox allows it.

```bash
# Linux
google-chrome --remote-debugging-port=9222 --user-data-dir=./.bcode/way2-chrome

# macOS
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9222 --user-data-dir=./.bcode/way2-chrome

# Windows (cmd.exe)
"C:\Program Files\Google\Chrome\Application\chrome.exe" ^
  --remote-debugging-port=9222 --user-data-dir=.\.bcode\way2-chrome

# Windows (PowerShell)
& "C:\Program Files\Google\Chrome\Application\chrome.exe" `
  --remote-debugging-port=9222 --user-data-dir=.\.bcode\way2-chrome
```

Then resolve the live WebSocket URL via `/json/version` and connect:

```js
const ver = await fetch("http://127.0.0.1:9222/json/version").then(r => r.json())
await session.connect({ wsUrl: ver.webSocketDebuggerUrl })
```

This is the canonical Way 2 path. Works on every Chrome that serves `/json/version` (every Chromium-based browser launched with `--remote-debugging-port`).

**Older / alternate path: `{ profileDir }`.** On older Chrome (pre-147) and on the chrome://inspect Way 1 path, Chrome writes a `DevToolsActivePort` file inside the user-data-dir, and `session.connect({ profileDir: "<same path as --user-data-dir>" })` reads the WS URL directly from it — no HTTP probe. Chrome 147+ has been observed (macOS, Windows) to NOT write this file when launched with a custom `--user-data-dir`, so this path no longer works for Way 2 on modern Chrome. Use it only if `/json/version` is unavailable.

Two precisions on the `--user-data-dir`:

- **It must not be Chrome's platform default.** Chrome 136 and later silently no-op the `--remote-debugging-port` flag when `--user-data-dir` is the platform default, even if you pass it explicitly. The platform defaults are `%LOCALAPPDATA%\Google\Chrome\User Data` on Windows, `~/Library/Application Support/Google/Chrome` on macOS, `~/.config/google-chrome` on Linux. An empty or new path gives a fresh clean profile that Chrome will persist there across future launches.
- **You cannot reuse the user's everyday Chrome profile by copying its files into a custom directory.** Chrome will accept the flag and start, so it looks like it works — but cookies are encrypted under a key bound to the *original* directory and will not survive the copy. Bookmarks and extensions transfer; logged-in sessions do not. If you need the user's real logins, use Way 1.

The bare `ws://host:port/devtools/browser` form (no UUID suffix) does not work — Chrome's browser-level endpoint includes a per-process UUID. Always resolve via `/json/version` first.

**Way 2 troubleshooting:**

- **Chrome's launch log prints `DevTools listening on ws://...:<port>/...` before the bind succeeds.** That line is not a reliable readiness signal: if the port is already taken, you'll see the line immediately followed by `bind() failed: Address already in use` and Chrome exits. Confirm the port is actually open with `curl http://127.0.0.1:<port>/json/version` (or fetch from a snippet) before connecting.
- **Windows: launching Chrome while any other Chrome is already running silently hands the new flags off to the existing process** — `--remote-debugging-port` is ignored. Kill all `chrome.exe` first (or use a unique `--user-data-dir` and accept that some Windows builds still no-op).
- **`{ profileDir }` raises ENOENT on `DevToolsActivePort`** — Chrome 147+ doesn't write this file under custom `--user-data-dir`. Use the `/json/version` route above instead.

**Way 3 — provision and connect to a Browser Use cloud browser.** Best when the user can't see the browser, you need a clean profile, geo-located proxy, or fingerprint isolation. BU cloud browsers also auto-solve captchas (Cloudflare Turnstile, reCAPTCHA, hCaptcha) — when you land on one, just stop driving and `await new Promise(r => setTimeout(r, 10000))`; the solver runs server-side and the page advances on its own. Local browsers (Way 1, Way 2) do not have this. Read `{{SKILLS_DIR}}/cloud-browser.md` for the full pattern (provision, stop, swap profile/proxy). Briefly:

```js
const r = await fetch("https://api.browser-use.com/api/v3/browsers", {
  method: "POST",
  headers: { "X-Browser-Use-API-Key": process.env.BROWSER_USE_API_KEY, "Content-Type": "application/json" },
  body: "{}",
})
const { id, cdpUrl, liveUrl } = await r.json()
// BU's cdpUrl is the HTTPS discovery endpoint (e.g. https://cdpN.browser-use.com),
// not a WebSocket URL. Resolve it like a remote Chrome: fetch /json/version and
// use the webSocketDebuggerUrl field. The resolved URL is `wss://...` (secure);
// `session.connect({ wsUrl })` handles both `ws://` and `wss://` transparently.
const ver = await fetch(`${cdpUrl}/json/version`).then(r => r.json())
await session.connect({ wsUrl: ver.webSocketDebuggerUrl })
console.log("liveUrl for the user to watch:", liveUrl)
```

Requires `BROWSER_USE_API_KEY` in the environment (the user should have set this before launching bcode). If absent, tell the user to get a key at https://browser-use.com and `export BROWSER_USE_API_KEY=...`.

When `BROWSER_USE_API_KEY` is set, `webfetch` is automatically enhanced with `fetch-use` (Chrome TLS fingerprint + residential proxy + session cookies) — each request is free, but consumes a small amount of proxy bandwidth from the BU account. Disable in `opencode.json` with `experimental.fetch_use: false`.

## Attaching to a target

After `connect()`, attach to a page target before driving the browser:

```js
const targets = (await session.Target.getTargets({})).targetInfos
const page = targets.find(t => t.type === "page" && !t.url.startsWith("chrome://"))
await session.use(page.targetId)
```

`session.use(targetId)` makes subsequent calls auto-route to that target. Switch with another `session.use`.

## Driving a page

Domain methods follow `session.<Domain>.<method>(params)` and return Promises. The full surface (652 commands) is the Chrome DevTools Protocol — see https://chromedevtools.github.io/devtools-protocol/.

Common moves:

```js
// Navigate.
await session.Page.enable()
await session.Page.navigate({ url: "https://example.com" })
await session.waitFor("Page.loadEventFired")

// Evaluate JS in the page.
const r = await session.Runtime.evaluate({
  expression: "document.title",
  returnByValue: true,
})
console.log(r.result.value)

// Click by coordinates.
const x = 200, y = 300
await session.Input.dispatchMouseEvent({ type: "mouseMoved", x, y })
await session.Input.dispatchMouseEvent({ type: "mousePressed", x, y, button: "left", clickCount: 1 })
await session.Input.dispatchMouseEvent({ type: "mouseReleased", x, y, button: "left", clickCount: 1 })

// Type text.
await session.Input.insertText({ text: "hello" })

// Screenshot.
await session.Page.captureScreenshot({ format: "png" })
// You see the image inline on the next turn — `browser_execute` automatically
// attaches every `Page.captureScreenshot` result. No need to decode, save, or
// `read` the bytes back. The base64 is still in `data` (via the return value)
// for the rare case you want to process it programmatically.
```

For the full menu of UI mechanics — dropdowns, dialogs, iframes, shadow DOM, uploads, scrolling, screenshots-with-highlights — list `{{SKILLS_DIR}}/interaction-skills/` to see all available topics, then read the relevant one.

## Switching browsers mid-session

You own the connection. To swap:

```js
await session.close()
await session.connect({ /* new opts */ })
```

Cloud cleanup is your responsibility — if you're done with a cloud browser, stop it explicitly (see `{{SKILLS_DIR}}/cloud-browser.md` for the PATCH call). Otherwise it persists until your API quota or BU's idle timer reclaims it.

## Reusing code: write to the workspace, import from snippet

The agent-workspace is per-project: `./.bcode/agent-workspace/`. It's a directory of `.ts` files you own and edit with the standard `write`/`edit` tools — flat for small projects, organized into subdirectories (`scrape/`, `auth/`, `cloud/`, …) when you accumulate enough scripts that grouping helps. Imports work at any depth; pick whatever layout makes the project easiest to navigate. Saved scripts travel with the project (`.bcode/agent-workspace/` is committed by default), so `git clone && cd && bcode` shares them.

Write once, import many:

```ts
// ./.bcode/agent-workspace/scrape_titles.ts (you write this with the `write` tool)
export async function run(session: any, urls: string[]) {
  const titles: string[] = []
  await session.Page.enable()
  for (const url of urls) {
    await session.Page.navigate({ url })
    await session.waitFor("Page.loadEventFired")
    const r = await session.Runtime.evaluate({ expression: "document.title", returnByValue: true })
    titles.push(r.result.value)
  }
  return titles
}
```

```js
// later snippet (browser_execute call) — construct the absolute path from cwd.
const path = process.cwd() + "/.bcode/agent-workspace/scrape_titles.ts"
const m = await import(`${path}?t=${Date.now()}`)
const titles = await m.run(session, ["https://example.com", "https://example.org"])
console.log(JSON.stringify(titles))
```

Cache-bust (`?t=${Date.now()}`) is your responsibility: without it, edits to the file won't be picked up. The pattern is the same for any depth — save to `subdir/foo.ts`, import by full path.

## Guardrails

- **Top-level `import`** statements inside the snippet body are **not allowed** — the snippet is wrapped in an async function. Use `await import(...)` instead.
- **No CPU-bound infinite loops without `await`.** JS Promises aren't preemptively cancellable; a `for (;;)` without an `await` yield-point will not respect the timeout. Insert `await new Promise(r => setTimeout(r, 0))` if you genuinely need a long compute loop.
- `console.log`, `console.error`, `console.warn`, `console.info`, `console.debug` are all captured and streamed to the user. Treat them as your stdout. Other `console.*` methods (`table`, `dir`, `trace`, …) work but write to bcode's stderr without being captured into the tool result.
- The snippet's `return` value is captured separately (JSON-serialized when possible).

## When something doesn't work

- **`session.Page.navigate` hangs forever** → the page is showing a native dialog. Use `session.Page.handleJavaScriptDialog({ accept: true })` to dismiss.
- **Selectors don't find elements that you can see** → likely an iframe or shadow DOM. Read `{{SKILLS_DIR}}/interaction-skills/iframes.md` or `shadow-dom.md`.
- **Actions silently no-op** → the page is mid-load. After `Page.navigate`, await `session.waitFor("Page.loadEventFired")` before driving inputs.
- **Connection refused, 403, or `WS closed before open` on connect()** → see the Way 1 failure-mode list above. Most often: the `chrome://inspect/#remote-debugging` checkbox isn't ticked, or the Chrome 144+ "Allow remote debugging?" popup hasn't been clicked. Pass `{ profileDir, timeoutMs: 30000 }` (Way 1, user's profile) to wait up to 30s for the click, or fall back to Way 2.
- **Cloud `connect()` fails after a successful provision** → check that `cdp_url` came back in the POST response; some BU regions return `cdpUrl` (camelCase) — accept both. See `{{SKILLS_DIR}}/cloud-browser.md`.
