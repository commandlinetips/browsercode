// Skills materialization with `{{SKILLS_DIR}}` template substitution.
//
// Regression guard: the on-disk `BROWSER.md` (and any other markdown skill)
// must not contain literal `{{SKILLS_DIR}}` strings — those are templates the
// agent is supposed to see resolved to the absolute extraction path.

import { expect, test } from "bun:test"
import fs from "fs/promises"
import os from "os"
import path from "path"
import { Skills } from "../src/skills"

test("resolveSkillsDir materializes BROWSER.md with {{SKILLS_DIR}} substituted", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "bcode-skills-"))
  try {
    const dir = await Skills.resolveSkillsDir(dataDir)
    expect(dir).toBe(path.join(dataDir, "skills"))

    const browser = await fs.readFile(path.join(dir, "BROWSER.md"), "utf8")
    // No literal placeholder leaks through to the agent.
    expect(browser).not.toContain("{{SKILLS_DIR}}")
    // Cross-references resolve to absolute paths under the materialized dir.
    expect(browser).toContain(path.join(dir, "cloud-browser.md"))
    expect(browser).toContain(path.join(dir, "interaction-skills"))

    // Non-Markdown sentinel itself must not be substituted.
    const sentinel = await fs.readFile(path.join(dir, ".bcode-build"), "utf8")
    expect(sentinel).not.toContain("{{SKILLS_DIR}}")
  } finally {
    await fs.rm(dataDir, { recursive: true, force: true })
  }
})

test("resolveSkillsDir is idempotent — second call hits the sentinel and skips rewrite", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "bcode-skills-"))
  try {
    const dir = await Skills.resolveSkillsDir(dataDir)
    const browser = path.join(dir, "BROWSER.md")
    const before = (await fs.stat(browser)).mtimeMs
    // Yield to push mtime forward if a rewrite happens.
    await new Promise((r) => setTimeout(r, 20))
    // Bypass in-process cache by reaching through to a fresh data dir handle.
    const dir2 = await Skills.resolveSkillsDir(dataDir)
    expect(dir2).toBe(dir)
    const after = (await fs.stat(browser)).mtimeMs
    expect(after).toBe(before)
  } finally {
    await fs.rm(dataDir, { recursive: true, force: true })
  }
})

test("resolveSkillsDir re-materializes when the target path changes (sentinel mismatch)", async () => {
  const dataDirA = await fs.mkdtemp(path.join(os.tmpdir(), "bcode-skills-a-"))
  const dataDirB = await fs.mkdtemp(path.join(os.tmpdir(), "bcode-skills-b-"))
  try {
    const dirA = await Skills.resolveSkillsDir(dataDirA)
    const dirB = await Skills.resolveSkillsDir(dataDirB)
    const browserA = await fs.readFile(path.join(dirA, "BROWSER.md"), "utf8")
    const browserB = await fs.readFile(path.join(dirB, "BROWSER.md"), "utf8")
    expect(browserA).toContain(dirA)
    expect(browserB).toContain(dirB)
    expect(browserA).not.toContain(dirB)
    expect(browserB).not.toContain(dirA)
  } finally {
    await fs.rm(dataDirA, { recursive: true, force: true })
    await fs.rm(dataDirB, { recursive: true, force: true })
  }
})
