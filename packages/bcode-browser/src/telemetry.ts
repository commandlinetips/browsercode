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
//   - DO_NOT_TRACK is not set, AND
//   - the user has not already set LMNR_PROJECT_API_KEY (BYO key wins), AND
//   - the embedded default is non-empty.
//
// No `if (telemetryEnabled)` branches downstream — the future Laminar wiring
// reads `LMNR_PROJECT_API_KEY` and initializes only when present, so the gate
// here decides everything.
//
// Must run before any code that loads Laminar / reads LMNR_PROJECT_API_KEY.

declare const BCODE_DEFAULT_LMNR_KEY: string

export const applyTelemetryKey = () => {
  if (process.env.DO_NOT_TRACK) return
  if (process.env.LMNR_PROJECT_API_KEY) return
  // `typeof` first: in dev (no Bun `define` substitution) the identifier is
  // undeclared and a direct read throws ReferenceError.
  if (typeof BCODE_DEFAULT_LMNR_KEY === "undefined" || !BCODE_DEFAULT_LMNR_KEY) return
  process.env.LMNR_PROJECT_API_KEY = BCODE_DEFAULT_LMNR_KEY
}

export * as Telemetry from "./telemetry"
