// Harness directory resolver.
//
// The vendored browser-harness lives at `packages/bcode-browser/harness/`,
// which is a sibling of this `src/` directory. We resolve it from
// `import.meta.url` so callers don't have to know the workspace layout.
//
// In dev mode (running from source) this points at the in-tree harness.
// For built binaries (Phase C distribution) the build script will embed or
// copy the harness next to the binary; the resolution there will need to
// switch on packaging mode. Not built yet — explicit TODO when Phase C lands.

import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const HARNESS_DIR = path.resolve(__dirname, "..", "harness")

export * as Harness from "./harness"
