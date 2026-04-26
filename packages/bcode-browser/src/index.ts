// @browser-use/bcode-browser
//
// This package holds all Level-1 BrowserCode code — substantial implementation
// that is logically self-contained and has zero upstream-fork friction.
//
// See decisions.md §1c (three-level model) and §1d (this package) in the
// BrowserCode memory docs.
//
// Contents (planned, by ROADMAP phase):
//   harness/               — vendored browser-harness (ROADMAP A2; tracked in root UPSTREAM.md)
//   src/browser-execute/   — browser_execute tool body (ROADMAP A4)
//   src/fetch-use/         — FetchUse.Service implementation (ROADMAP B1)
//   src/cloud/             — cloud deploy, skillbase, judge clients (Phase D)
//
// Integration points into packages/opencode (tool registration, service wiring,
// CLI commands) are Level 2 — they live in packages/opencode/src, not here,
// and must stay as minimal as possible (one-line rule).
