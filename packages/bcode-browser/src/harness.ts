// Harness directory resolver.
//
// Two packaging modes (decisions.md §4.6, §4.8):
//
// 1. Dev mode — running from source under bun. `import.meta.url` resolves to
//    `packages/bcode-browser/src/harness.ts` on disk, harness lives at the
//    sibling `../harness/` directory. Used by `bun run --cwd packages/opencode
//    dev` and tests. Resolution is synchronous and free.
//
// 2. Compiled mode — running from a `bun build --compile` binary.
//    `import.meta.url` lives under `/$bunfs/` (or `B:/~BUN/` on Windows), a
//    read-only virtual filesystem. uv cannot write `.venv/` there. We extract
//    the embedded harness (built into the binary by `script/embed-harness.ts`)
//    to a single un-versioned directory at `~/.cache/bcode/harness/`.
//
//    Per decisions §4.8, the cache is **un-versioned** so agent edits to
//    `agent-workspace/agent_helpers.py` survive binary upgrades. Extraction
//    policy on every launch: walk the embed map and write each file out, with
//    one exception — `agent-workspace/agent_helpers.py` is preserved if
//    already present. Everything else (`src/browser_harness/*.py`,
//    `pyproject.toml`, skills, etc.) is overwritten unconditionally; the
//    binary is the source of truth for those, and we want curated skill /
//    daemon / setup updates to land on upgrade.
//    `agent-workspace/agent_helpers.py` is the one Green-zone file (decisions
//    §3.7, §4.5) where agent learnings accumulate and must outlive upgrades.
//    Upstream moved the agent-editable surface from root `helpers.py` to
//    `agent-workspace/agent_helpers.py` in PR #229; the core `helpers.py`
//    inside `src/browser_harness/` is now baseline-overwrite.
//
//    Concurrent first-callers are deduplicated via an in-process promise.
//    Bun.write is atomic per file; cross-process races just result in the
//    same bytes being written, which is fine.

import fs from "fs/promises"
import os from "os"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// Bun's bunfs root is `/$bunfs/` on POSIX and `B:\~BUN\` on Windows (native
// separators). Normalize before comparing so the compiled-mode check works on
// both platforms — without this, the Windows compiled binary falls through to
// DEV_HARNESS_DIR (which doesn't exist on the user's machine) and every
// subsequent spawn fails with a misleading uv-missing error.
const isCompiled = (() => {
  const d = __dirname.replaceAll("\\", "/")
  return d.startsWith("/$bunfs/") || d.startsWith("B:/~BUN/")
})()
const DEV_HARNESS_DIR = path.resolve(__dirname, "..", "harness")
const cachedHarnessDir = path.join(os.homedir(), ".cache", "bcode", "harness")

// Files that are agent-editable and must be preserved across binary upgrades.
// Everything in the embed map that isn't in this set is baseline-overwrite.
// Per decisions §3.7 / §4.5: only `agent-workspace/agent_helpers.py` is
// Green-zone editable inside the harness. The core `src/browser_harness/`
// package (daemon, admin, helpers, run, _ipc) is baseline-only.
const PRESERVED_PATHS = new Set(["agent-workspace/agent_helpers.py"])

const exists = (p: string) => fs.access(p).then(() => true, () => false)

const extractEmbeddedHarness = async (): Promise<string> => {
  // @ts-expect-error generated at build time
  const mod = await import("bcode-harness.gen.ts").catch(() => null)
  if (!mod) throw new Error("bcode-harness.gen.ts not found in compiled binary — was the build script updated?")
  const fileMap = mod.default as Record<string, string>

  await fs.mkdir(cachedHarnessDir, { recursive: true })
  await Promise.all(
    Object.entries(fileMap).map(async ([rel, bunfsPath]) => {
      const dest = path.join(cachedHarnessDir, rel)
      if (PRESERVED_PATHS.has(rel) && (await exists(dest))) return
      await fs.mkdir(path.dirname(dest), { recursive: true })
      await Bun.write(dest, Bun.file(bunfsPath))
    }),
  )
  return cachedHarnessDir
}

let extractPromise: Promise<string> | null = null

export const resolveHarnessDir = (): Promise<string> => {
  if (!isCompiled) return Promise.resolve(DEV_HARNESS_DIR)
  if (!extractPromise) extractPromise = extractEmbeddedHarness()
  return extractPromise
}

export * as Harness from "./harness"
