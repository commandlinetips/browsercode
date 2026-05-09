// Skills materialization with `{{SKILLS_DIR}}` template substitution.
// Regression guard: the on-disk skill files must not contain literal
// `{{SKILLS_DIR}}` strings — those are templates the agent reads as
// resolved absolute paths.

import { expect, test } from "bun:test"
import fs from "fs/promises"
import os from "os"
import path from "path"
import { Skills } from "../src/skills"

test("resolveSkillsDir materializes skills with {{SKILLS_DIR}} substituted", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "bcode-skills-"))
  try {
    const dir = await Skills.resolveSkillsDir(dataDir)
    expect(dir).toBe(path.join(dataDir, "skills"))
    const browser = await fs.readFile(path.join(dir, "BROWSER.md"), "utf8")
    expect(browser).not.toContain("{{SKILLS_DIR}}")
    expect(browser).toContain(path.join(dir, "cloud-browser.md"))
    expect(browser).toContain(path.join(dir, "interaction-skills"))
  } finally {
    await fs.rm(dataDir, { recursive: true, force: true })
  }
})

test("different dataDirs get their own substituted paths", async () => {
  const a = await fs.mkdtemp(path.join(os.tmpdir(), "bcode-skills-a-"))
  const b = await fs.mkdtemp(path.join(os.tmpdir(), "bcode-skills-b-"))
  try {
    const dirA = await Skills.resolveSkillsDir(a)
    const dirB = await Skills.resolveSkillsDir(b)
    const [browserA, browserB] = await Promise.all([
      fs.readFile(path.join(dirA, "BROWSER.md"), "utf8"),
      fs.readFile(path.join(dirB, "BROWSER.md"), "utf8"),
    ])
    expect(browserA).toContain(dirA)
    expect(browserB).toContain(dirB)
    expect(browserA).not.toContain(dirB)
    expect(browserB).not.toContain(dirA)
  } finally {
    await fs.rm(a, { recursive: true, force: true })
    await fs.rm(b, { recursive: true, force: true })
  }
})
