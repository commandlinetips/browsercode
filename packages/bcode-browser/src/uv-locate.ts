// Resolve the absolute path to the `uv` executable.
//
// Why: `ChildProcess.make("uv", ...)` resolves bare names against
// `process.env.PATH` only. On Windows the official uv installer writes
// `%USERPROFILE%\.local\bin` into the *User* PATH registry key, which
// GUI-launched processes (Cursor / VSCode terminal, double-clicked bcode.exe)
// don't pick up until a full re-login. Result: `uv --version` works in the
// user's shell but the bcode child process gets ENOENT.
//
// Probe order:
//   1. Walk `process.env.PATH` (with platform-correct extensions on Windows).
//   2. Fall back to a per-platform allowlist of well-known install dirs.
// On miss, return the bare name "uv" so the caller's existing ENOENT path
// (UV_MISSING_HINT, exit 127) keeps working.
//
// Memoized per-process via `Effect.cached` — yield once at service
// construction to bind the cached effect, then yield it on each call to get
// the resolved path. First browser_execute call pays the fs probe; subsequent
// calls are free.
//
// Pure addition. Level 1.
import { Effect } from "effect"
import fs from "fs/promises"
import os from "os"
import path from "path"

const isWindows = process.platform === "win32"
const EXTS = isWindows ? [".exe", ".cmd", ".bat", ""] : [""]

const allowlist = (() => {
  const home = os.homedir()
  if (isWindows)
    return [
      path.join(home, ".local", "bin"),
      path.join(process.env.LOCALAPPDATA ?? path.join(home, "AppData", "Local"), "uv", "bin"),
      path.join(process.env.LOCALAPPDATA ?? path.join(home, "AppData", "Local"), "Programs", "uv"),
    ]
  return [path.join(home, ".local", "bin"), path.join(home, ".cargo", "bin"), "/opt/homebrew/bin", "/usr/local/bin"]
})()

const findIn = async (dir: string): Promise<string | null> => {
  for (const ext of EXTS) {
    const candidate = path.join(dir, `uv${ext}`)
    if (await fs.access(candidate).then(() => true, () => false)) return candidate
  }
  return null
}

const probe = async (): Promise<string> => {
  const pathDirs = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean)
  for (const dir of [...pathDirs, ...allowlist]) {
    const hit = await findIn(dir)
    if (hit) return hit
  }
  return "uv"
}

export const uvLocate = Effect.cached(Effect.promise(probe))

export * as UvLocate from "./uv-locate"
