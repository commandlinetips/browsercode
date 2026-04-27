import fs from "fs/promises"
import { xdgData, xdgCache, xdgConfig, xdgState } from "xdg-basedir"
import path from "path"
import os from "os"
import { Filesystem } from "../util"
import { Flock } from "@opencode-ai/shared/util/flock"

// BrowserCode uses `bcode` as the XDG app name. On first launch we
// migrate from the legacy `opencode` directories so users who previously
// ran opencode (or an earlier bcode binary) keep their sessions, auth,
// and config. The legacy directory is left in place as a rollback path.
const app = "bcode"
const legacyApp = "opencode"

async function migrateLegacy(legacy: string, current: string) {
  if (await Filesystem.exists(current)) return
  if (!(await Filesystem.exists(legacy))) return
  await fs.cp(legacy, current, { recursive: true })
}

const data = path.join(xdgData!, app)
const cache = path.join(xdgCache!, app)
const config = path.join(xdgConfig!, app)
const state = path.join(xdgState!, app)

export const Path = {
  // Allow override via OPENCODE_TEST_HOME for test isolation
  get home() {
    return process.env.OPENCODE_TEST_HOME || os.homedir()
  },
  data,
  bin: path.join(cache, "bin"),
  log: path.join(data, "log"),
  cache,
  config,
  state,
}

await Promise.all([
  migrateLegacy(path.join(xdgData!, legacyApp), data),
  migrateLegacy(path.join(xdgConfig!, legacyApp), config),
  migrateLegacy(path.join(xdgState!, legacyApp), state),
  // cache is regenerated on demand; not migrated.
])

// Initialize Flock with global state path
Flock.setGlobal({ state })

await Promise.all([
  fs.mkdir(Path.data, { recursive: true }),
  fs.mkdir(Path.config, { recursive: true }),
  fs.mkdir(Path.state, { recursive: true }),
  fs.mkdir(Path.log, { recursive: true }),
  fs.mkdir(Path.bin, { recursive: true }),
])

const CACHE_VERSION = "21"

const version = await Filesystem.readText(path.join(Path.cache, "version")).catch(() => "0")

if (version !== CACHE_VERSION) {
  try {
    const contents = await fs.readdir(Path.cache)
    await Promise.all(
      contents.map((item) =>
        fs.rm(path.join(Path.cache, item), {
          recursive: true,
          force: true,
        }),
      ),
    )
  } catch {}
  await Filesystem.write(path.join(Path.cache, "version"), CACHE_VERSION)
}

export * as Global from "."
