// browser_execute — single-tool browser interface (decisions.md §3.2).
//
// Spawns the vendored harness with a Python snippet:
//
//   uv run --project <HARNESS_DIR> browser-harness -c "<code>"
//
// `browser-harness` is the console-script entry point declared in the
// harness's `pyproject.toml` (since upstream PR #229 moved the package to a
// `src/browser_harness/` layout). `uv run --project <dir>` resolves the
// project's venv/dependencies, then dispatches to the entry point.
//
// The harness manages the daemon itself via admin.ensure_daemon(). We just
// pipe stdout+stderr back. BU_NAME is namespaced by sessionID so parallel
// sub-agents (each with their own session) get isolated daemons + browsers.
//
// BH_TMP_DIR points at a per-session scratch dir so sock/port/pid/log + screenshot
// output land somewhere predictable per session, instead of all sessions sharing
// /tmp. The Level-2 wrapper supplies the cache root; we own the layout convention.
//
// Level 1 per decisions.md §1c — substantial implementation lives here. The
// Level-2 hook in packages/opencode is a one-line wrapper.

import fs from "fs/promises"
import path from "path"
import { Effect, Stream } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"
import z from "zod"
import { resolveHarnessDir } from "./harness"
import { uvLocate } from "./uv-locate"

// Canonical per-session scratch dir layout. Caller supplies dataDir
// (e.g. opencode's Global.Path.data); we own the `sessions/<id>` shape.
// AF_UNIX sun_path is 104 bytes on macOS — `<dataDir>/sessions/<sessionID>/bu-<sessionID>.sock`
// must fit. SessionID is `ses_` + 26 chars (30 chars). The literal suffix is
// `/sessions/` (10) + 30 + `/bu-` (4) + 30 + `.sock` (5) = 79 chars, leaving
// 25 chars of headroom for dataDir. Typical XDG dataDir is well under that.
export const sessionScratchDir = (dataDir: string, sessionID: string) =>
  path.join(dataDir, "sessions", sessionID)

const DEFAULT_TIMEOUT_MS = 60 * 1000
const MAX_TIMEOUT_MS = 10 * 60 * 1000

export const parameters = z.object({
  python: z.string().describe("Python source to execute against the browser harness."),
  timeout: z
    .number()
    .describe(`Timeout in milliseconds. Default ${DEFAULT_TIMEOUT_MS}, max ${MAX_TIMEOUT_MS}.`)
    .optional(),
})

export type Parameters = z.infer<typeof parameters>

export interface ExecuteContext {
  readonly sessionID: string
  // Per-session scratch dir, passed to the harness as BH_TMP_DIR. The harness
  // mkdirs it on import, but we mkdir-p here too so failures surface as a
  // direct effect error rather than a child-process exit. Pre-compute via
  // sessionScratchDir(dataDir, sessionID).
  readonly bhTmpDir: string
  // Optional progress callback invoked per output chunk (combined stdout+stderr).
  // Level-2 supplies this to drive TUI streaming via opencode's `ctx.metadata`.
  // The callback receives the fully accumulated output so far, not just the
  // delta — simpler for consumers that just want to set "current output".
  readonly onChunk?: (output: string) => Effect.Effect<void>
}

export interface ExecuteResult {
  readonly output: string
  readonly exitCode: number
}

const UV_MISSING_HINT =
  "uv is not installed or not on PATH. Install it once: curl -fsSL https://astral.sh/uv/install.sh | sh " +
  "(Windows: irm https://astral.sh/uv/install.ps1 | iex). " +
  "If you just installed uv, restart your terminal so PATH picks it up."

// Spawn errors flow through effect's PlatformError; ENOENT lives on the wrapped
// cause's `.code`. Walk the cause chain so we detect it regardless of nesting.
const isUvMissing = (err: unknown): boolean => {
  let cur: unknown = err
  for (let i = 0; i < 5 && cur; i++) {
    if (typeof cur === "object" && cur !== null && (cur as { code?: string }).code === "ENOENT") return true
    cur = (cur as { cause?: unknown }).cause
  }
  return false
}

export const make = Effect.fn("BrowserExecute.make")(function* () {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const locate = yield* uvLocate

  const execute = (args: Parameters, ctx: ExecuteContext) =>
    Effect.gen(function* () {
      const harnessDir = yield* Effect.promise(() => resolveHarnessDir())
      yield* Effect.promise(() => fs.mkdir(ctx.bhTmpDir, { recursive: true }))
      const uv = yield* locate
      const proc = ChildProcess.make(
        uv,
        ["run", "--project", harnessDir, "browser-harness", "-c", args.python],
        {
          cwd: harnessDir,
          extendEnv: true,
          env: { BU_NAME: ctx.sessionID, BH_TMP_DIR: ctx.bhTmpDir },
          stdin: "ignore",
        },
      )

      // uv not on PATH (ENOENT) — surface as exit 127 with the install hint
      // so both the agent (via output) and the user (via TUI) can act on it.
      // 127 mirrors POSIX "command not found". Other spawn failures rethrow.
      const spawned = yield* spawner.spawn(proc).pipe(
        Effect.catch((err) =>
          isUvMissing(err) ? Effect.succeed("uv-missing" as const) : Effect.fail(new Error(`failed to spawn uv: ${err}`)),
        ),
      )
      if (spawned === "uv-missing") return { output: UV_MISSING_HINT, exitCode: 127 } satisfies ExecuteResult

      let output = ""
      const drain = Stream.runForEach(Stream.decodeText(spawned.all), (chunk) =>
        Effect.gen(function* () {
          output += chunk
          if (ctx.onChunk) yield* ctx.onChunk(output)
        }),
      )
      const [, exitCode] = yield* Effect.all([drain, spawned.exitCode], { concurrency: 2 })

      return { output, exitCode } satisfies ExecuteResult
    }).pipe(
      Effect.scoped,
      Effect.timeoutOrElse({
        duration: Math.min(args.timeout ?? DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS),
        orElse: () => Effect.fail(new Error("browser_execute timed out")),
      }),
    )

  return { parameters, execute }
})

export * as BrowserExecute from "./browser-execute"
