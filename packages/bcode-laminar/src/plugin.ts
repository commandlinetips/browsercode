// LaminarPlugin — opencode-side hook wiring.
//
// Vendored and trimmed from lmnr-opencode-plugin/src/index.ts.
// Differences vs upstream:
//   - No loadEnv() — opencode loads .env / .env.local already.
//   - No external-context (caller-side) injection path; we don't ship a TS host.
//   - log fallback is a no-op (no console.log; the TUI owns stdout).
//
// First-run notice is intentionally short and non-alarming. Industry standard
// for telemetry disclosure is one line referencing DO_NOT_TRACK; that lives in
// README and runs once on key application via the bcode-browser telemetry
// module, not here.

import type { Plugin } from "@opencode-ai/plugin"
import { NodeSDK } from "@opentelemetry/sdk-node"

import { createSpanExporter } from "./exporter"
import { OpenCodeLaminarSpanProcessor } from "./processor"
import { startTurnSpan } from "./span"
import { sessionCurrentTurnSpan, subagentSessionIds } from "./state"

const DEFAULT_GRPC_PORT_LMNR = 8443
const DEFAULT_GRPC_PORT_GENERIC = 443

const parsePort = (raw: string | undefined, fallback: number): number => {
  if (!raw) return fallback
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 && n <= 65535 ? n : fallback
}

export const LaminarPlugin: Plugin = ({ client }) => {
  const projectApiKey = process.env.LMNR_PROJECT_API_KEY
  // OTel-standard endpoint env vars opt into OTLP/HTTP+protobuf — used by
  // OSS users routing to non-Laminar collectors (Honeycomb, Tempo, Jaeger),
  // and by the V4 cloud worker which relays through a backend that holds
  // the real Laminar key. Either env var alone (without LMNR_PROJECT_API_KEY)
  // is sufficient to enable tracing.
  const otlpEndpoint =
    process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ?? process.env.OTEL_EXPORTER_OTLP_ENDPOINT
  const baseUrl = process.env.LMNR_BASE_URL ?? "https://api.lmnr.ai"
  const port = parsePort(
    process.env.LMNR_GRPC_PORT,
    baseUrl === "https://api.lmnr.ai" ? DEFAULT_GRPC_PORT_LMNR : DEFAULT_GRPC_PORT_GENERIC,
  )
  // When set, every "turn" span this plugin starts is parented under the
  // given Laminar span context. Used by external evaluation harnesses that
  // spawn bcode as a subprocess and want the agent's traces to nest under
  // their own evaluation span (one trace per task, judge + agent siblings).
  // Format: JSON serialization of LaminarSpanContext (snake_case or camelCase
  // keys both accepted by parseLaminarSpanContext in span.ts).
  const parentSpanContext = process.env.LMNR_PARENT_SPAN_CONTEXT

  const log = (level: "debug" | "info" | "warn" | "error", message: string) => {
    client.app
      .log({ body: { service: "laminar", level, message } })
      .catch(() => {})
  }

  if (!projectApiKey && !otlpEndpoint) return Promise.resolve({})

  const processor = new OpenCodeLaminarSpanProcessor({
    exporter: createSpanExporter({ apiKey: projectApiKey ?? "", baseUrl, port }),
    log,
  })

  const sdk = new NodeSDK({ spanProcessors: [processor] })
  sdk.start()
  log("info", `Laminar tracing initialized → ${otlpEndpoint ?? baseUrl}`)

  return Promise.resolve({
    config: async (config) => {
      if (!config.experimental?.openTelemetry) {
        config.experimental = { ...(config.experimental ?? {}), openTelemetry: true }
      }
    },
    event: async ({ event }) => {
      switch (event.type) {
        case "session.idle": {
          const sessionId = event.properties.sessionID
          const span = sessionCurrentTurnSpan[sessionId]
          if (span) {
            span.end()
            delete sessionCurrentTurnSpan[sessionId]
          }
          await processor.forceFlush()
          break
        }
        case "server.instance.disposed": {
          // End any turn spans still open so they're flushed before shutdown.
          for (const [sessionId, span] of Object.entries(sessionCurrentTurnSpan)) {
            span.end()
            delete sessionCurrentTurnSpan[sessionId]
          }
          for (const key of Object.keys(subagentSessionIds)) delete subagentSessionIds[key]
          // sdk.shutdown() drains the inner BatchSpanProcessor and exporter
          // and removes the global TracerProvider; explicit processor.shutdown()
          // is redundant but harmless.
          await sdk.shutdown().catch(() => {})
          break
        }
        case "session.created":
        case "session.updated":
          if (event.properties.info.parentID) {
            const parentId = event.properties.info.parentID
            if (!subagentSessionIds[parentId]) subagentSessionIds[parentId] = new Set()
            subagentSessionIds[parentId].add(event.properties.info.id)
          }
          break
        case "session.deleted": {
          const sessionId = event.properties.info.id
          const span = sessionCurrentTurnSpan[sessionId]
          if (span) {
            span.end()
            delete sessionCurrentTurnSpan[sessionId]
          }
          delete subagentSessionIds[sessionId]
          for (const children of Object.values(subagentSessionIds)) children.delete(sessionId)
          await processor.forceFlush()
          break
        }
      }
    },
    "chat.message": async (input, output) => {
      const { sessionID, agent, model, messageID, variant } = input
      // Skip sub-agent prompts — their parent already has a turn span.
      const isSubagent = Object.values(subagentSessionIds).some((children) =>
        children.has(sessionID),
      )
      if (isSubagent || sessionCurrentTurnSpan[sessionID]) return

      const span = startTurnSpan({
        name: "turn",
        sessionId: sessionID,
        parentSpanContext,
        input: {
          sessionID,
          agent,
          model,
          messageID,
          variant,
          message: output.message,
          parts: output.parts,
        },
      })
      sessionCurrentTurnSpan[sessionID] = span
    },
  })
}
