// Skills directory resolver.
//
// Materializes the skills tree to `<dataDir>/skills/` and substitutes the
// `{{SKILLS_DIR}}` placeholder in every file with that absolute path so
// cross-references inside BROWSER.md (e.g. ``read `{{SKILLS_DIR}}/cloud-
// browser.md` ``) point at a real location. Source is `bcode-skills.gen.ts`
// in compiled mode (a `bun build --compile` virtual fs) and the in-tree
// `../skills/` in dev mode.
//
// Skills are read-only baseline; the agent's editable surface lives
// elsewhere (`<projectDir>/.bcode/agent-workspace/`, per-project).

import fs from "fs/promises"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isCompiled = __dirname.replaceAll("\\", "/").match(/^\/\$bunfs\/|^B:\/~BUN\//) !== null
const DEV_SKILLS_DIR = path.resolve(__dirname, "..", "skills")

// Static — the agent permission glob and the substituted placeholder both
// resolve to this path.
export const skillsDir = (dataDir: string) => path.join(dataDir, "skills")

// Returns `{ rel: text }` for every skill file, sourced from the build-time
// embed in compiled mode and from the worktree in dev mode.
const readAllSkills = async (): Promise<Record<string, string>> => {
  if (isCompiled) {
    // @ts-expect-error generated at build time
    const mod = await import("bcode-skills.gen.ts").catch(() => null)
    if (!mod) throw new Error("bcode-skills.gen.ts not found — was the build script updated?")
    const map = mod.default as Record<string, string>
    return Object.fromEntries(
      await Promise.all(Object.entries(map).map(async ([rel, p]) => [rel, await Bun.file(p).text()])),
    )
  }
  const files = await Array.fromAsync(new Bun.Glob("**/*").scan({ cwd: DEV_SKILLS_DIR }))
  return Object.fromEntries(
    await Promise.all(
      files.map(async (rel) => [rel.replaceAll("\\", "/"), await fs.readFile(path.join(DEV_SKILLS_DIR, rel), "utf8")]),
    ),
  )
}

const cache = new Map<string, Promise<string>>()

export const resolveSkillsDir = (dataDir: string): Promise<string> => {
  const cached = cache.get(dataDir)
  if (cached) return cached
  const target = skillsDir(dataDir)
  const fresh = (async () => {
    const files = await readAllSkills()
    await fs.mkdir(target, { recursive: true })
    await Promise.all(
      Object.entries(files).map(async ([rel, text]) => {
        const dest = path.join(target, rel)
        await fs.mkdir(path.dirname(dest), { recursive: true })
        await fs.writeFile(dest, text.replaceAll("{{SKILLS_DIR}}", target), "utf8")
      }),
    )
    return target
  })()
  cache.set(dataDir, fresh)
  fresh.catch(() => { if (cache.get(dataDir) === fresh) cache.delete(dataDir) })
  return fresh
}

export * as Skills from "./skills"
