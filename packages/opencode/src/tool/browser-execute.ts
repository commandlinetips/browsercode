// browser_execute — Level-2 hook (decisions.md §1c).
//
// Adapter only. Substantive logic lives in @browser-use/bcode-browser/browser-execute.

import path from "path"
import { Effect, Schema } from "effect"
import { BrowserExecute } from "@browser-use/bcode-browser/browser-execute"
import { InstanceState } from "@/effect/instance-state"
import * as Tool from "./tool"
import DESCRIPTION from "./browser-execute.txt"

const MAX_METADATA_LENGTH = 30_000
const preview = (text: string) =>
  text.length <= MAX_METADATA_LENGTH ? text : "...\n\n" + text.slice(-MAX_METADATA_LENGTH)

// Per-project workspace where the agent saves reusable .ts scripts. Resolved
// from opencode's project-detection (Instance.directory) — same source that
// already finds .bcode/plans, .bcode/db, etc. Shared via clone (`.bcode/` is
// tracked-by-default, see hard rule #3) and isolated per project.
const workspaceDirOf = (projectDir: string) => path.join(projectDir, ".bcode", "agent-workspace")

export const BrowserExecuteTool = Tool.define(
  "browser_execute",
  Effect.gen(function* () {
    const impl = yield* BrowserExecute.make()
    return {
      // Resolve {{WORKSPACE_DIR}} per-call against the active project's
      // workspace dir. The agent sees a concrete absolute path and never has
      // to reason about project-detection.
      description: DESCRIPTION,
      parameters: impl.parameters,
      execute: (args: Schema.Schema.Type<typeof impl.parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          // Permission gate. Default agent ruleset has `"*": "allow"` so this
          // auto-allows; users can opt out via bcode.json — either
          // `"tools": { "browser_execute": false }` or a per-permission rule.
          yield* ctx.ask({
            permission: "browser_execute",
            patterns: ["*"],
            always: ["*"],
            metadata: {},
          })

          const instance = yield* InstanceState.context
          const workspaceDir = workspaceDirOf(instance.directory)

          const result = yield* impl.execute(args, {
            workspaceDir,
            // Stream chunks to the TUI as they arrive — same pattern as bash.
            onChunk: (output) =>
              ctx.metadata({
                metadata: { output: preview(output) },
              }),
          })
          return {
            title: "browser_execute",
            output: [
              result.output.trimEnd(),
              result.result === "null" ? "" : `=> ${result.result}`,
            ]
              .filter(Boolean)
              .join("\n\n"),
            metadata: { result: result.result, output: preview(result.output) },
          }
        }).pipe(Effect.orDie),
    }
  }),
)
