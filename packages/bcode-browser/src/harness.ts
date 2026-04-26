// Harness directory resolver.
//
// Two packaging modes (decisions.md §4.6):
//
// 1. Dev mode — running from source under bun. `import.meta.url` resolves to
//    `packages/bcode-browser/src/harness.ts` on disk, harness lives at the
//    sibling `../harness/` directory. Used by `bun run --cwd packages/opencode
//    dev` and tests. Resolution is synchronous and free.
//
// 2. Compiled mode — running from a `bun build --compile` binary.
//    `import.meta.url` lives under `/$bunfs/` (or `B:/~BUN/` on Windows), a
//    read-only virtual filesystem. uv cannot write `.venv/` there. On first
//    call we extract the embedded harness files (built into the binary by
//    `script/embed-harness.ts`) to `~/.cache/bcode/harness/<version>/` and
//    return that path. The cache is keyed by `OPENCODE_VERSION` so a new
//    binary version always extracts fresh — no migration logic required.
//    Concurrent first-callers are deduplicated via an in-process promise;
//    cross-process races are tolerated because `mkdir -p` and overwriting a
//    finalized directory only re-runs the extraction (idempotent).

import fs from "fs/promises"
import os from "os"
import path from "path"
import { fileURLToPath } from "url"

declare const OPENCODE_VERSION: string

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isCompiled = __dirname.startsWith("/$bunfs/") || __dirname.startsWith("B:/~BUN/")
const DEV_HARNESS_DIR = path.resolve(__dirname, "..", "harness")

const version = typeof OPENCODE_VERSION === "string" ? OPENCODE_VERSION : "local"
const cachedHarnessDir = path.join(os.homedir(), ".cache", "bcode", "harness", version)

const extractEmbeddedHarness = async (): Promise<string> => {
  // @ts-expect-error generated at build time
  const mod = await import("bcode-harness.gen.ts").catch(() => null)
  if (!mod) throw new Error("bcode-harness.gen.ts not found in compiled binary — was the build script updated?")
  const fileMap = mod.default as Record<string, string>

  // Marker file makes "fully extracted" atomic. Any partial run leaves no
  // marker, so the next call re-extracts.
  const marker = path.join(cachedHarnessDir, ".bcode-extracted")
  if (await fs.access(marker).then(() => true, () => false)) return cachedHarnessDir

  await fs.mkdir(cachedHarnessDir, { recursive: true })
  await Promise.all(
    Object.entries(fileMap).map(async ([rel, bunfsPath]) => {
      const dest = path.join(cachedHarnessDir, rel)
      await fs.mkdir(path.dirname(dest), { recursive: true })
      await Bun.write(dest, Bun.file(bunfsPath))
    }),
  )
  await fs.writeFile(marker, version)
  return cachedHarnessDir
}

let extractPromise: Promise<string> | null = null

export const resolveHarnessDir = (): Promise<string> => {
  if (!isCompiled) return Promise.resolve(DEV_HARNESS_DIR)
  if (!extractPromise) extractPromise = extractEmbeddedHarness()
  return extractPromise
}

export * as Harness from "./harness"
