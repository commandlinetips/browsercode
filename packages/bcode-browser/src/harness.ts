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
//    to `<dataDir>/harness/`, where dataDir is opencode's XDG_DATA_HOME for
//    bcode (~/.local/share/bcode/ on Linux/Mac). The harness is data, not
//    cache: it accumulates agent edits to `agent-workspace/agent_helpers.py`
//    that must outlive a `~/.cache` wipe.
//
//    A content-hash sentinel at `<harness>/.bcode-build` records the embed
//    bundle that produced the on-disk tree. On session start we compare it to
//    the bundle hash and skip extraction when they match — warm launches cost
//    one stat. Mismatch (binary upgrade) snapshots the active tree to
//    `<dataDir>/harness-archive/<old-buildHash>/` (excluding `.venv/` and
//    `__pycache__/`) so the agent can read the old skills + helpers when
//    migrating its own customizations, then re-extracts every embed file
//    except anything under `agent-workspace/` (the Green-zone subtree —
//    decisions §3.7, §4.5: agent_helpers.py and any agent-authored files
//    like domain-skills/<host>/*.md persist across upgrades). The core
//    `src/browser_harness/` package and shipped skill files are
//    baseline-overwrite.
//
//    Concurrent first-callers are deduplicated via an in-process promise.
//    Bun.write is atomic per file; cross-process races just result in the
//    same bytes being written, which is fine.
//
//    On first launch after the relocation, any pre-existing harness at the
//    legacy `~/.cache/bcode/harness/` is moved to the new location so agent
//    edits under `agent-workspace/` survive the upgrade.

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
const LEGACY_CACHE_DIR = path.join(os.homedir(), ".cache", "bcode", "harness")
const SENTINEL_NAME = ".bcode-build"

// Embed paths that are agent-editable and must be preserved across binary
// upgrades. Per decisions §3.7 / §4.5 the entire `agent-workspace/` subtree
// is the Green zone (agent_helpers.py plus any agent-authored files such as
// domain-skills/<host>/*.md). The core `src/browser_harness/` package and
// shipped skill files are baseline-overwrite.
const PRESERVED_PREFIX = "agent-workspace/"

// Compute the harness directory for a given dataDir without touching the
// filesystem. The agent permission whitelist uses this; runtime extraction
// uses `resolveHarnessDir`.
export const harnessDir = (dataDir: string) => path.join(dataDir, "harness")

// Where past-version snapshots live. Each subdir is named for the buildHash
// of the harness it was extracted from. Read-only after creation.
export const harnessArchiveDir = (dataDir: string) => path.join(dataDir, "harness-archive")

// Skipped during archive copies — regenerable (.venv) or junk (__pycache__).
// Match by basename at any depth so nested __pycache__/ inside src/ is also
// excluded.
const ARCHIVE_EXCLUDE = new Set([".venv", "__pycache__"])

const exists = (p: string) => fs.access(p).then(() => true, () => false)

const readSentinel = async (dir: string) => {
  try { return await fs.readFile(path.join(dir, SENTINEL_NAME), "utf8") }
  catch { return null }
}

const migrateLegacyIfPresent = async (target: string) => {
  if (!(await exists(LEGACY_CACHE_DIR))) return
  if (await exists(target)) return
  await fs.mkdir(path.dirname(target), { recursive: true })
  try { await fs.rename(LEGACY_CACHE_DIR, target) }
  catch (err) {
    if ((err as { code?: string }).code !== "EXDEV") throw err
    await fs.cp(LEGACY_CACHE_DIR, target, { recursive: true })
    await fs.rm(LEGACY_CACHE_DIR, { recursive: true, force: true })
  }
}

const archiveExistingHarness = async (dataDir: string, target: string, oldHash: string) => {
  const archiveTarget = path.join(harnessArchiveDir(dataDir), oldHash)
  if (await exists(archiveTarget)) return // already archived (re-entry); nothing to do
  await fs.mkdir(harnessArchiveDir(dataDir), { recursive: true })
  await fs.cp(target, archiveTarget, {
    recursive: true,
    filter: (src) => !ARCHIVE_EXCLUDE.has(path.basename(src)),
  })
}

const extractEmbeddedHarness = async (dataDir: string): Promise<string> => {
  const target = harnessDir(dataDir)
  await migrateLegacyIfPresent(target)

  // @ts-expect-error generated at build time
  const mod = await import("bcode-harness.gen.ts").catch(() => null)
  if (!mod) throw new Error("bcode-harness.gen.ts not found in compiled binary — was the build script updated?")
  const fileMap = mod.default as Record<string, string>
  const buildHash = mod.buildHash as string

  const existing = await readSentinel(target)
  if (existing === buildHash) return target
  if (existing) await archiveExistingHarness(dataDir, target, existing)

  await fs.mkdir(target, { recursive: true })
  await Promise.all(
    Object.entries(fileMap).map(async ([rel, bunfsPath]) => {
      const dest = path.join(target, rel)
      if (rel.startsWith(PRESERVED_PREFIX) && (await exists(dest))) return
      await fs.mkdir(path.dirname(dest), { recursive: true })
      await Bun.write(dest, Bun.file(bunfsPath))
    }),
  )
  await fs.writeFile(path.join(target, SENTINEL_NAME), buildHash, "utf8")
  return target
}

// Per-dataDir cache. In production opencode passes the same Global.Path.data
// every call, so this is effectively a singleton; tests and any future
// multi-instance setup that resolves against multiple dataDirs each get their
// own deduplicated extraction without cross-directory contamination.
const extractCache = new Map<string, Promise<string>>()

export const resolveHarnessDir = (dataDir: string): Promise<string> => {
  if (!isCompiled) return Promise.resolve(DEV_HARNESS_DIR)
  const cached = extractCache.get(dataDir)
  if (cached) return cached
  const fresh = extractEmbeddedHarness(dataDir)
  extractCache.set(dataDir, fresh)
  // Evict on rejection so a transient failure (FS hiccup, partial write) doesn't
  // permanently brick subsequent calls. The `===` guard avoids clobbering a
  // retry that started after the failure but before this handler fired.
  fresh.catch(() => {
    if (extractCache.get(dataDir) === fresh) extractCache.delete(dataDir)
  })
  return fresh
}

export * as Harness from "./harness"
