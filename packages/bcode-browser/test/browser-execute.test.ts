// browser_execute end-to-end against headless Chrome. Same env-gate as
// cdp-smoke.test.ts (BCODE_SMOKE_CHROME=1 + BCODE_SMOKE_PROFILE_DIR).
//
// Verifies: AsyncFunction snippet wrapping, console.log capture, return-
// value serialization, multi-call session reuse via SessionStore, workspace
// dynamic-import inside a snippet.

import { afterAll, beforeAll, expect, test } from "bun:test"
import fs from "fs/promises"
import os from "os"
import path from "path"
import { Effect } from "effect"
import { BrowserExecute } from "../src/browser-execute"
import { SessionStore } from "../src/session-store"

const profileDir = process.env.BCODE_SMOKE_PROFILE_DIR
const enabled = process.env.BCODE_SMOKE_CHROME === "1" && profileDir

const sessionID = "test-" + Math.random().toString(36).slice(2, 8)
let workspaceDir: string
let dataDir: string

beforeAll(async () => {
  workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "bcode-be-"))
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "bcode-data-"))
})

afterAll(async () => {
  await SessionStore.evict(sessionID)
  await fs.rm(workspaceDir, { recursive: true, force: true })
  await fs.rm(dataDir, { recursive: true, force: true })
})

test.skipIf(!enabled)("connect + console.log + return value", async () => {
  const result = await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const impl = yield* BrowserExecute.make(dataDir)
        return yield* impl.execute(
          {
            code: `await session.connect({ profileDir: ${JSON.stringify(profileDir!)}, timeoutMs: 5000 });
                   console.log("connected", session.isConnected());
                   return { ok: session.isConnected() };`,
          },
          { sessionID, workspaceDir },
        )
      }),
    ),
  )
  expect(result.output).toContain("connected true")
  expect(JSON.parse(result.result)).toEqual({ ok: true })
})

test.skipIf(!enabled)("Session is reused across calls (SessionStore)", async () => {
  const result = await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const impl = yield* BrowserExecute.make(dataDir)
        return yield* impl.execute(
          {
            code: `// connect was called in the previous test on the same sessionID.
                   console.log("still connected:", session.isConnected());
                   return session.isConnected();`,
          },
          { sessionID, workspaceDir },
        )
      }),
    ),
  )
  expect(result.output).toContain("still connected: true")
  expect(JSON.parse(result.result)).toBe(true)
})

test.skipIf(!enabled)("workspace import inside a snippet", async () => {
  const file = path.join(workspaceDir, "title.ts")
  await fs.writeFile(
    file,
    `export const run = async (session) => {
       const targets = (await session.Target.getTargets({})).targetInfos
       const page = targets.find((t) => t.type === "page")
       if (!page) {
         const created = await session.Target.createTarget({ url: "about:blank" })
         await session.use(created.targetId)
       } else {
         await session.use(page.targetId)
       }
       await session.Page.enable()
       await session.Page.navigate({ url: "data:text/html,<title>bcode-be</title>" })
       await session.waitFor("Page.loadEventFired", undefined, 5000)
       const r = await session.Runtime.evaluate({ expression: "document.title", returnByValue: true })
       return r.result.value
     }`,
    "utf8",
  )

  const result = await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const impl = yield* BrowserExecute.make(dataDir)
        return yield* impl.execute(
          {
            code: `const m = await import(${JSON.stringify(file)} + "?t=" + Date.now());
                   const t = await m.run(session);
                   console.log("title:", t);
                   return t;`,
          },
          { sessionID, workspaceDir },
        )
      }),
    ),
  )
  expect(result.output).toContain("title: bcode-be")
  expect(JSON.parse(result.result)).toBe("bcode-be")
})

test.skipIf(!enabled)("syntax error in snippet surfaces a clean failure", async () => {
  await expect(
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const impl = yield* BrowserExecute.make(dataDir)
          return yield* impl.execute(
            {
              code: `const x = (`,
            },
            { sessionID, workspaceDir },
          )
        }),
      ),
    ),
  ).rejects.toThrow(/syntax error/)
})
