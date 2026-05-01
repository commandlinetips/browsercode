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
    const impl = yield* BrowserExecute.make()
    return {
      description: DESCRIPTION,
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
            // Per-session scratch under Global.Path.data (persistent state,
            // not cache). Harness writes sock/port/pid/log + screenshots here.
            // Agent reads screenshots back via the read tool; the agent
            // permission ruleset (agent.ts) allows <Global.Path.data>/sessions/*
            // so that read doesn't prompt.
            bhTmpDir: BrowserExecute.sessionScratchDir(Global.Path.data, ctx.sessionID),
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
