// Skills directory resolver.
//
// Two packaging modes:
//
// 1. Dev mode — `import.meta.url` resolves to `packages/bcode-browser/src/`
//    on disk, skills live at the sibling `../skills/`. Used by `bun run
//    --cwd packages/opencode dev` and tests.
//
// 2. Compiled mode — running from a `bun build --compile` binary.
//    `import.meta.dir` lives under `/$bunfs/` (or `B:/~BUN/` on Windows),
//    a read-only virtual filesystem the agent's `read` tool can't see in a
//    useful path shape. We extract the embedded skills (built into the
//    binary by `script/embed-skills.ts`) to `<dataDir>/skills/`. A content-
//    hash sentinel at `<dataDir>/skills/.bcode-build` records the embed
//    bundle that produced the on-disk tree; warm launches stat-and-skip.
//
// Skills are read-only baseline: every launch overwrites the on-disk tree
// from the binary's embed (no agent-editable surface). The agent's editable
// surface is `<projectDir>/.bcode/agent-workspace/`, per-project, never here.

import fs from "fs/promises"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isCompiled = (() => {
  const d = __dirname.replaceAll("\\", "/")
  return d.startsWith("/$bunfs/") || d.startsWith("B:/~BUN/")
})()
const DEV_SKILLS_DIR = path.resolve(__dirname, "..", "skills")
const SENTINEL_NAME = ".bcode-build"

// Static path so the agent permission glob can use a stable absolute path.
export const skillsDir = (dataDir: string) => path.join(dataDir, "skills")

const readSentinel = async (dir: string) => {
  try { return await fs.readFile(path.join(dir, SENTINEL_NAME), "utf8") }
  catch { return null }
}

const extractEmbeddedSkills = async (dataDir: string): Promise<string> => {
  const target = skillsDir(dataDir)
  // @ts-expect-error generated at build time
  const mod = await import("bcode-skills.gen.ts").catch(() => null)
  if (!mod) throw new Error("bcode-skills.gen.ts not found in compiled binary — was the build script updated?")
  const fileMap = mod.default as Record<string, string>
  const buildHash = mod.buildHash as string

  if ((await readSentinel(target)) === buildHash) return target

  await fs.mkdir(target, { recursive: true })
  // Skills are baseline-overwrite — every file from the embed lands on disk.
  await Promise.all(
    Object.entries(fileMap).map(async ([rel, bunfsPath]) => {
      const dest = path.join(target, rel)
      await fs.mkdir(path.dirname(dest), { recursive: true })
      await Bun.write(dest, Bun.file(bunfsPath))
    }),
  )
  await fs.writeFile(path.join(target, SENTINEL_NAME), buildHash, "utf8")
  return target
}

const extractCache = new Map<string, Promise<string>>()

export const resolveSkillsDir = (dataDir: string): Promise<string> => {
  if (!isCompiled) return Promise.resolve(DEV_SKILLS_DIR)
  const cached = extractCache.get(dataDir)
  if (cached) return cached
  const fresh = extractEmbeddedSkills(dataDir)
  extractCache.set(dataDir, fresh)
  fresh.catch(() => {
    if (extractCache.get(dataDir) === fresh) extractCache.delete(dataDir)
  })
  return fresh
}

export * as Skills from "./skills"
