// browser_execute — Level-2 hook (decisions.md §1c).
//
// Adapter only. All logic lives in @browser-use/bcode-browser/browser-execute.

import { Effect } from "effect"
import type z from "zod"
import { BrowserExecute } from "@browser-use/bcode-browser/browser-execute"
import * as Tool from "./tool"
import DESCRIPTION from "./browser-execute.txt"

export const BrowserExecuteTool = Tool.define(
  "browser_execute",
  Effect.gen(function* () {
    const impl = yield* BrowserExecute.make()
    return {
      description: DESCRIPTION,
      parameters: impl.parameters,
      execute: (args: z.infer<typeof impl.parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const result = yield* impl.execute(args, { sessionID: ctx.sessionID })
          return {
            title: "browser_execute",
            output: result.output,
            metadata: { exitCode: result.exitCode },
          }
        }).pipe(Effect.orDie),
    }
  }),
)
