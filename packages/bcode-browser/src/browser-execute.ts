// browser_execute — single-tool browser interface (decisions.md §3.2).
//
// Executes a JavaScript snippet in-process against a per-opencode-session
// `Session` (the CDP transport from `./cdp/session.ts`). No subprocess, no
// daemon, no Unix socket, no `uv` — we wrap the snippet with
// `new AsyncFunction("session", "console", code)` and run it.
//
// Snippet scope (Phase H hard rule #3 — workspace-as-plain-code):
//   `session`        — the live CDP `Session`, persistent across calls.
//   `console`        — per-call capture object shadowing the global. Same
//                      `{log, error, warn, info}` API as the real console.
//   standard JS globals.
//
// Nothing is auto-loaded. To reuse code from a previous snippet the agent
// writes plain `await import("/abs/path/foo.ts?t=" + Date.now())` against a
// `.ts` file it owns under `<projectDir>/.bcode/agent-workspace/`. Same
// mechanism for a 5-line wrapper and a 500-line scrape script. The Level-2
// wrapper supplies `ctx.workspaceDir` so `.ts` files written under it can be
// addressed by absolute path; this resolver creates the dir on first use.
//
// Output capture: a per-call `console` object (`{log, error, warn, info}`)
// is bound into the snippet's lexical scope as the second AsyncFunction
// argument. JavaScript's scope chain resolves `console.log(...)` to the
// function parameter before reaching the global, so existing snippets keep
// working byte-identically while the global `console` stays untouched.
// This is concurrency-safe: two overlapping `execute` calls (different
// opencode sessions in the same process, parallel tool calls within one
// session, etc.) each get their own capture buffer with no global state to
// clobber. See `memory/browsercode/phase_h_eval_feasibility_findings.md`
// for the verified eval pattern (compiled-mode `bun build --compile` works
// on Linux x64; AsyncFunction + dynamic import survive bunfs).
//
// Cancellation: JS Promises are not preemptively cancellable. A snippet
// without `await` yield-points (e.g. `for (let i = 0; i < 1e9; i++) {}`)
// runs to completion before our timeout fiber observes it. `Effect.timeoutOrElse`
// fails the surrounding fiber but the orphan Promise keeps running until it
// finishes. This matches the `uv run` subprocess case (SIGTERM only after
// the Python signal handler yields). Document, don't fix.
//
// Level 1 per decisions.md §1c — substantial implementation lives here. The
// Level-2 hook in packages/opencode is a thin adapter.

import fs from "fs/promises"
import { Effect, Schema } from "effect"
import { SessionStore } from "./session-store"
import { Skills } from "./skills"

const DEFAULT_TIMEOUT_MS = 60 * 1000
const MAX_TIMEOUT_MS = 10 * 60 * 1000

export const parameters = Schema.Struct({
  code: Schema.String.annotate({
    description:
      "JavaScript source. Wrapped in an async function with `session` (CDP Session) and `console` (per-call capture; same `log/error/warn/info` API) bound.",
  }),
  timeout: Schema.optional(Schema.Number).annotate({
    description: `Timeout in milliseconds. Default ${DEFAULT_TIMEOUT_MS}, max ${MAX_TIMEOUT_MS}.`,
  }),
})

export type Parameters = Schema.Schema.Type<typeof parameters>

export interface ExecuteContext {
  // Identifies the per-opencode-session CDP Session to bind into the snippet.
  // The same Session is reused across calls — the agent calls
  // `session.connect(...)` in one snippet and subsequent snippets find the
  // already-connected Session.
  readonly sessionID: string
  // Per-project workspace dir: <projectDir>/.bcode/agent-workspace/. Created
  // on first call. The agent reads/writes/edits .ts files here via the
  // standard read/write/edit tools and imports them at runtime via
  // `await import("<absPath>?t=" + Date.now())`. Resolved by the Level-2
  // wrapper from opencode's project-detection (Instance.directory).
  readonly workspaceDir: string
  // Optional progress callback invoked per output chunk (combined console
  // streams). Receives the fully accumulated output so far, not just the
  // delta — simpler for consumers that just want to set "current output".
  readonly onChunk?: (output: string) => Effect.Effect<void>
}

export interface ExecuteResult {
  readonly output: string
  // The snippet's `return` value, JSON-serialized when possible. `undefined`
  // serializes as `null` (JSON has no undefined). Non-serializable values
  // fall back to `String(v)`.
  readonly result: string
}

// AsyncFunction is not a global — pull it off an async arrow's constructor.
const AsyncFunction = (async () => {}).constructor as new (
  ...args: string[]
) => (...injected: unknown[]) => Promise<unknown>

const serialize = (v: unknown): string => {
  if (v === undefined) return "null"
  try {
    return JSON.stringify(
      v,
      (_k, val) => (typeof val === "bigint" ? val.toString() : val),
      2,
    ) ?? "null"
  } catch {
    return JSON.stringify(String(v))
  }
}

// Snippet executor. The CDP Session is resolved per-call from `SessionStore`
// keyed on `ctx.sessionID`. The agent connects with `await session.connect(...)`
// in one snippet (Way 1 / Way 2 / Way 3 in BROWSER.md); the Session persists
// for follow-up snippets in the same opencode session.
//
// `dataDir` is opencode's XDG_DATA_HOME for bcode (~/.local/share/bcode/ on
// Linux/Mac). Compiled-mode skills are extracted to `<dataDir>/skills/` once
// per build hash; dev mode resolves to the in-tree `packages/bcode-browser/
// skills/` directly. The resolved path is exposed via the returned
// `skillsDir` getter so the Level-2 wrapper can substitute it into the tool
// description at make-time.
export const make = Effect.fn("BrowserExecute.make")(function* (dataDir: string) {
  const skillsDir = yield* Effect.promise(() => Skills.resolveSkillsDir(dataDir))

  const execute = (args: Parameters, ctx: ExecuteContext) =>
    Effect.gen(function* () {
      const session = SessionStore.get(ctx.sessionID)
      yield* Effect.promise(() => fs.mkdir(ctx.workspaceDir, { recursive: true }))

      const wrapped = yield* Effect.try({
        try: () => new AsyncFunction("session", "console", args.code),
        catch: (err) => new Error(`syntax error in browser_execute snippet: ${err}`),
      })

      let output = ""
      const tee = (...a: unknown[]) => {
        output += a.map((x) => (typeof x === "string" ? x : serialize(x))).join(" ") + "\n"
        if (ctx.onChunk) Effect.runFork(ctx.onChunk(output))
      }
      // Prototype-chain to the real `console` so uncommon methods (`debug`,
      // `dir`, `trace`, `table`, `group`, …) don't throw when a snippet calls
      // them. The five "log line" methods are tee'd into our capture; anything
      // else falls through to the real console — written but not captured.
      const snippetConsole = Object.assign(Object.create(console), {
        log: tee,
        error: tee,
        warn: tee,
        info: tee,
        debug: tee,
      })

      const ran = yield* Effect.tryPromise({
        try: () => wrapped(session, snippetConsole),
        catch: (err) => new Error(`browser_execute snippet threw: ${err instanceof Error ? err.stack ?? err.message : String(err)}`),
      })

      return { output, result: serialize(ran) } satisfies ExecuteResult
    }).pipe(
      Effect.scoped,
      Effect.timeoutOrElse({
        duration: Math.min(args.timeout ?? DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS),
        orElse: () => Effect.fail(new Error("browser_execute timed out")),
      }),
    )

  return { parameters, execute, skillsDir }
})

export * as BrowserExecute from "./browser-execute"
