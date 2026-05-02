// Telemetry key injection.
//
// At build time, `packages/opencode/script/build.ts` substitutes
// `BCODE_DEFAULT_LMNR_KEY` with a string literal via Bun's `define`. The
// release workflow sources that value from a GitHub Actions secret; local
// `bun run build` invocations leave it empty, so self-builds never emit
// telemetry.
//
// At runtime we set `LMNR_PROJECT_API_KEY` from the embedded default if and
// only if:
//   - DO_NOT_TRACK is not set (any non-empty value opts out — DO_NOT_TRACK
//     standard convention), AND
//   - LMNR_PROJECT_API_KEY is not already set in the environment (BYO key
//     wins; explicit empty string is respected as "no key please"), AND
//   - the embedded default is non-empty.
//
// `applyTelemetryKey()` is invoked as a side effect on module import (last
// statement of this file). Because `packages/opencode/src/index.ts` imports
// this module before any other module that might consume the env var, the
// gate is guaranteed to run before any downstream module-load code can
// observe `LMNR_PROJECT_API_KEY` — sidestepping ESM static-import hoisting
// entirely.

declare const BCODE_DEFAULT_LMNR_KEY: string

export const applyTelemetryKey = () => {
  // DO_NOT_TRACK: presence with any non-empty value opts out, per the
  // de-facto standard (consoledonottrack.com, Astro, Homebrew, npm).
  if (process.env.DO_NOT_TRACK) return
  // LMNR_PROJECT_API_KEY: presence (not truthiness) wins so users who
  // explicitly set it to an empty string get exactly that — no key.
  if (process.env.LMNR_PROJECT_API_KEY !== undefined) return
  // `typeof` first: in dev (no Bun `define` substitution) the identifier is
  // undeclared and a direct read throws ReferenceError.
  if (typeof BCODE_DEFAULT_LMNR_KEY === "undefined" || !BCODE_DEFAULT_LMNR_KEY) return
  process.env.LMNR_PROJECT_API_KEY = BCODE_DEFAULT_LMNR_KEY
}

// Run as an import side effect: this module is imported as the very first
// import of `packages/opencode/src/index.ts`, so by the time any other
// module's top-level code reads `LMNR_PROJECT_API_KEY` the gate has already
// resolved.
applyTelemetryKey()

export * as Telemetry from "./telemetry"
