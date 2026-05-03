import { Effect, Layer, Schema, Context, Stream } from "effect"
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { withTransientReadRetry } from "@/util/effect-http-client"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"
import path from "path"
import z from "zod"
import { BusEvent } from "@/bus/bus-event"
import { Flag } from "@opencode-ai/core/flag/flag"
import * as Log from "@opencode-ai/core/util/log"
import { makeRuntime } from "@opencode-ai/core/effect/runtime"
import semver from "semver"
import { InstallationChannel, InstallationVersion } from "@opencode-ai/core/installation/version"

const log = Log.create({ service: "installation" })

export type Method = "curl" | "npm" | "yarn" | "pnpm" | "bun" | "brew" | "scoop" | "choco" | "unknown"

export type ReleaseType = "patch" | "minor" | "major"

export const Event = {
  Updated: BusEvent.define(
    "installation.updated",
    Schema.Struct({
      version: Schema.String,
    }),
  ),
  UpdateAvailable: BusEvent.define(
    "installation.update-available",
    Schema.Struct({
      version: Schema.String,
    }),
  ),
}

export function getReleaseType(current: string, latest: string): ReleaseType {
  const currMajor = semver.major(current)
  const currMinor = semver.minor(current)
  const newMajor = semver.major(latest)
  const newMinor = semver.minor(latest)

  if (newMajor > currMajor) return "major"
  if (newMinor > currMinor) return "minor"
  return "patch"
}

export const Info = z
  .object({
    version: z.string(),
    latest: z.string(),
  })
  .meta({
    ref: "InstallationInfo",
  })
export type Info = z.infer<typeof Info>

export const USER_AGENT = `browsercode/${InstallationChannel}/${InstallationVersion}/${Flag.OPENCODE_CLIENT}`

export function isPreview() {
  return InstallationChannel !== "latest"
}

export function isLocal() {
  return InstallationChannel === "local"
}

export class UpgradeFailedError extends Schema.TaggedErrorClass<UpgradeFailedError>()("UpgradeFailedError", {
  stderr: Schema.String,
}) {}

// BrowserCode currently only ships the curl installer (https://bcode.sh/install).
// npm/brew/scoop/choco branches are stubbed: `method()` only returns "curl"
// or "unknown", and `latest()` / `upgrade()` short-circuit on "unknown".
// When we add another distribution channel, restore the corresponding registry
// schemas + branches from upstream `anomalyco/opencode`.
const GitHubRelease = Schema.Struct({ tag_name: Schema.String })

export interface Interface {
  readonly info: () => Effect.Effect<Info>
  readonly method: () => Effect.Effect<Method>
  readonly latest: (method?: Method) => Effect.Effect<string>
  readonly upgrade: (method: Method, target: string) => Effect.Effect<void, UpgradeFailedError>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/Installation") {}

export const layer: Layer.Layer<Service, never, HttpClient.HttpClient | ChildProcessSpawner.ChildProcessSpawner> =
  Layer.effect(
    Service,
    Effect.gen(function* () {
      const http = yield* HttpClient.HttpClient
      const httpOk = HttpClient.filterStatusOk(withTransientReadRetry(http))
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner

      const text = Effect.fnUntraced(
        function* (cmd: string[], opts?: { cwd?: string; env?: Record<string, string> }) {
          const proc = ChildProcess.make(cmd[0], cmd.slice(1), {
            cwd: opts?.cwd,
            env: opts?.env,
            extendEnv: true,
          })
          const handle = yield* spawner.spawn(proc)
          const out = yield* Stream.mkString(Stream.decodeText(handle.stdout))
          yield* handle.exitCode
          return out
        },
        Effect.scoped,
        Effect.catch(() => Effect.succeed("")),
      )

      // Re-runs the hosted install script with VERSION=<target>, which writes
      // the new binary to ~/.bcode/bin/bcode in place. Same flow as the
      // user's original `curl https://bcode.sh/install | bash` install.
      const upgradeCurl = Effect.fnUntraced(
        function* (target: string) {
          const response = yield* httpOk.execute(HttpClientRequest.get("https://bcode.sh/install"))
          const body = yield* response.text
          const proc = ChildProcess.make("bash", [], {
            stdin: Stream.make(new TextEncoder().encode(body)),
            env: { VERSION: target },
            extendEnv: true,
          })
          const handle = yield* spawner.spawn(proc)
          const [stdout, stderr] = yield* Effect.all(
            [Stream.mkString(Stream.decodeText(handle.stdout)), Stream.mkString(Stream.decodeText(handle.stderr))],
            { concurrency: 2 },
          )
          const code = yield* handle.exitCode
          return { code, stdout, stderr }
        },
        Effect.scoped,
        Effect.orDie,
      )

      const result: Interface = {
        info: Effect.fn("Installation.info")(function* () {
          return {
            version: InstallationVersion,
            latest: yield* result.latest(),
          }
        }),
        // Until BrowserCode ships beyond the curl installer, we only detect
        // the curl path. Anything else is "unknown" — `upgrade()` handles
        // that with a clear error pointing at the install script.
        method: Effect.fn("Installation.method")(function* () {
          if (process.execPath.includes(path.join(".bcode", "bin"))) return "curl" as Method
          if (process.execPath.includes(path.join(".local", "bin"))) return "curl" as Method
          return "unknown" as Method
        }),
        latest: Effect.fn("Installation.latest")(function* (installMethod?: Method) {
          const detectedMethod = installMethod || (yield* result.method())
          // No-op for unsupported methods so the TUI auto-upgrade check stays
          // silent for devs running from source.
          if (detectedMethod !== "curl") return InstallationVersion
          const response = yield* httpOk.execute(
            HttpClientRequest.get("https://api.github.com/repos/browser-use/browsercode/releases/latest").pipe(
              HttpClientRequest.acceptJson,
            ),
          )
          const data = yield* HttpClientResponse.schemaBodyJson(GitHubRelease)(response)
          return data.tag_name.replace(/^v/, "")
        }, Effect.orDie),
        upgrade: Effect.fn("Installation.upgrade")(function* (m: Method, target: string) {
          if (m !== "curl") {
            return yield* new UpgradeFailedError({
              stderr:
                "Auto-upgrade currently supports only curl-installed bcode. " +
                "Reinstall with:\n  curl -fsSL https://bcode.sh/install | bash",
            })
          }
          const upgradeResult = yield* upgradeCurl(target)
          if (upgradeResult.code !== 0) {
            return yield* new UpgradeFailedError({
              stderr: `${upgradeResult.stderr.trimEnd()}\n\nReinstall with:\n  curl -fsSL https://bcode.sh/install | bash`,
            })
          }
          log.info("upgraded", { method: m, target, stdout: upgradeResult.stdout, stderr: upgradeResult.stderr })
          yield* text([process.execPath, "--version"])
        }),
      }

      return Service.of(result)
    }),
  )

export const defaultLayer = layer.pipe(
  Layer.provide(FetchHttpClient.layer),
  Layer.provide(CrossSpawnSpawner.defaultLayer),
)

const { runPromise } = makeRuntime(Service, defaultLayer)

export const latest = (...args: Parameters<Interface["latest"]>) => runPromise((s) => s.latest(...args))
export const method = () => runPromise((s) => s.method())
export const upgrade = (...args: Parameters<Interface["upgrade"]>) => runPromise((s) => s.upgrade(...args))

export * as Installation from "."
