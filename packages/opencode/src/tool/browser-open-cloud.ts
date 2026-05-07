// browser_open_cloud — Level-2 hook (decisions.md §1c, §3.3, §6).
//
// Provisions a Browser Use cloud browser and binds the per-opencode-session
// CDP Session to it. After this tool returns, `browser_execute` snippets
// drive the cloud browser instead of any local Chrome.

import { Effect, Schema } from "effect"
import { CloudBrowser } from "@browser-use/bcode-browser/cloud-browser"
import * as Tool from "./tool"
import DESCRIPTION from "./browser-open-cloud.txt"

export const BrowserOpenCloudTool = Tool.define(
  "browser_open_cloud",
  Effect.gen(function* () {
    return {
      description: DESCRIPTION,
      parameters: CloudBrowser.provisionParameters,
      execute: (args: Schema.Schema.Type<typeof CloudBrowser.provisionParameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          yield* ctx.ask({
            permission: "browser_open_cloud",
            patterns: ["*"],
            always: ["*"],
            metadata: {},
          })
          const { id, liveUrl } = yield* CloudBrowser.open(ctx.sessionID, args)
          return {
            title: "browser_open_cloud",
            output: `Cloud browser ready.\nbrowserId: ${id}\nliveUrl: ${liveUrl}`,
            metadata: { browserId: id, liveUrl },
          }
        }).pipe(Effect.orDie),
    }
  }),
)
