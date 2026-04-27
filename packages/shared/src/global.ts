import path from "path"
import { xdgData, xdgCache, xdgConfig, xdgState } from "xdg-basedir"
import os from "os"
import { Context, Effect, Layer } from "effect"

export namespace Global {
  export class Service extends Context.Service<Service, Interface>()("@opencode/Global") {}

  export interface Interface {
    readonly home: string
    readonly data: string
    readonly cache: string
    readonly config: string
    readonly state: string
    readonly bin: string
    readonly log: string
  }

  export const layer = Layer.effect(
    Service,
    Effect.gen(function* () {
      // BrowserCode XDG app name. The legacy `opencode` directory is
      // migrated to this location on first launch by
      // `packages/opencode/src/global/index.ts`. This service does not
      // perform the migration itself; it just resolves to the new paths.
      const app = "bcode"
      const home = process.env.OPENCODE_TEST_HOME ?? os.homedir()
      const data = path.join(xdgData!, app)
      const cache = path.join(xdgCache!, app)
      const cfg = path.join(xdgConfig!, app)
      const state = path.join(xdgState!, app)
      const bin = path.join(cache, "bin")
      const log = path.join(data, "log")

      return Service.of({
        home,
        data,
        cache,
        config: cfg,
        state,
        bin,
        log,
      })
    }),
  )
}
