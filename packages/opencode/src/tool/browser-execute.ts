// browser_execute — Level-2 hook (decisions.md §1c).
//
// Adapter only. Substantive logic lives in @browser-use/bcode-browser/browser-execute.

import { Effect, Schema } from "effect"
import { BrowserExecute } from "@browser-use/bcode-browser/browser-execute"
import { Global } from "@opencode-ai/core/global"
import * as Tool from "./tool"
import DESCRIPTION from "./browser-execute.txt"

const MAX_METADATA_LENGTH = 30_000
const preview = (text: string) =>
  text.length <= MAX_METADATA_LENGTH ? text : "...\n\n" + text.slice(-MAX_METADATA_LENGTH)

export const BrowserExecuteTool = Tool.define(
  "browser_execute",
  Effect.gen(function* () {
    const impl = yield* BrowserExecute.make(Global.Path.data)
    return {
      // Substitute the resolved harness path (dev: repo path; compiled:
      // <dataDir>/harness/) so the SKILL.md / helpers.py references in the
      // description point at files that actually exist on disk.
      description: DESCRIPTION.replaceAll("{{HARNESS_DIR}}", impl.harnessDir),
      parameters: impl.parameters,
      execute: (args: Schema.Schema.Type<typeof impl.parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          // Permission gate. Default agent ruleset has `"*": "allow"` so this
          // auto-allows; users can opt out via opencode.json — either
          // `"tools": { "browser_execute": false }` or a per-permission rule.
          yield* ctx.ask({
            permission: "browser_execute",
            patterns: ["*"],
            always: ["*"],
            metadata: {},
          })

          const result = yield* impl.execute(args, {
            sessionID: ctx.sessionID,
            // Persistent per-session dir for screenshots/log. Agent reads
            // screenshots back via the read tool; the agent permission ruleset
            // (agent.ts) allows <Global.Path.data>/sessions/* without prompts.
            bhScratchDir: BrowserExecute.sessionScratchDir(Global.Path.data, ctx.sessionID),
            // Volatile short-path per-session dir for sock/port/pid. macOS
            // AF_UNIX sun_path is 104 bytes — kept under /tmp/bcode/<sid>/.
            bhRuntimeDir: BrowserExecute.sessionRuntimeDir(ctx.sessionID),
            // Stream chunks to the TUI as they arrive — same pattern as bash.
            onChunk: (output) =>
              ctx.metadata({
                metadata: { output: preview(output) },
              }),
          })
          return {
            title: "browser_execute",
            output: result.output,
            metadata: { exitCode: result.exitCode, output: preview(result.output) },
          }
        }).pipe(Effect.orDie),
    }
  }),
)
