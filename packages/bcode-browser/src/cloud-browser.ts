// Cloud-browser attach (decisions §3.3 / §6 — single API key, BU cloud
// surfaces). Provisions a Browser Use cloud browser via the public
// /api/v3/browsers REST surface and connects a `Session` to its `cdpUrl`.
//
// Three calls per attach:
//   1. POST /api/v3/browsers           → { id, cdpUrl, liveUrl }
//   2. (caller) session.connect({ wsUrl: cdpUrl })
//   3. PATCH /api/v3/browsers/<id>     → { state: "stop" }   (finalizer)
//
// `BROWSER_USE_API_KEY` must be set; we fail fast if absent so the Level-2
// wrapper can render a one-line error pointing at our docs without
// constructing a bad request.

import { Effect, Schema } from "effect"
import { SessionStore } from "./session-store"

const API_BASE = "https://api.browser-use.com/api/v3/browsers"

export const provisionParameters = Schema.Struct({
  profileId: Schema.optional(Schema.String).annotate({
    description: "Existing BU cloud profile id to attach to. Omit for a fresh ephemeral profile.",
  }),
  proxyCountryCode: Schema.optional(Schema.String).annotate({
    description: "ISO-2 country code for the proxy pool (e.g. \"us\", \"de\").",
  }),
})

export type ProvisionParameters = Schema.Schema.Type<typeof provisionParameters>

export interface ProvisionResult {
  readonly id: string
  readonly cdpUrl: string
  readonly liveUrl: string
}

const apiKey = () => {
  const k = process.env.BROWSER_USE_API_KEY
  if (!k) {
    throw new Error(
      "BROWSER_USE_API_KEY is not set. Cloud browsers require a Browser Use API key — get one at https://browser-use.com.",
    )
  }
  return k
}

const provision = (args: ProvisionParameters) =>
  Effect.tryPromise({
    try: async () => {
      const res = await fetch(API_BASE, {
        method: "POST",
        headers: {
          "X-Browser-Use-API-Key": apiKey(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          profile_id: args.profileId,
          proxy_country_code: args.proxyCountryCode,
        }),
      })
      if (!res.ok) throw new Error(`provision failed: ${res.status} ${await res.text()}`)
      const body = (await res.json()) as { id: string; cdp_url?: string; cdpUrl?: string; live_url?: string; liveUrl?: string }
      const cdpUrl = body.cdpUrl ?? body.cdp_url
      const liveUrl = body.liveUrl ?? body.live_url
      if (!cdpUrl || !liveUrl) throw new Error(`provision response missing cdpUrl/liveUrl: ${JSON.stringify(body)}`)
      return { id: body.id, cdpUrl, liveUrl } satisfies ProvisionResult
    },
    catch: (err) => (err instanceof Error ? err : new Error(String(err))),
  })

const stop = (id: string) =>
  Effect.tryPromise({
    try: async () => {
      const res = await fetch(`${API_BASE}/${id}`, {
        method: "PATCH",
        headers: {
          "X-Browser-Use-API-Key": apiKey(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ state: "stop" }),
      })
      if (!res.ok) throw new Error(`stop failed: ${res.status} ${await res.text()}`)
    },
    catch: (err) => (err instanceof Error ? err : new Error(String(err))),
  })

// Provisions a cloud browser, connects the per-opencode-session `Session` to
// it, and registers a stop-callback with `SessionStore` so the browser is
// torn down when the session is evicted (or, in practice, at process exit
// since opencode doesn't currently call evict — that's a known gap matching
// today's `uv run` subprocess shape, where a stuck Python interpreter also
// outlives the bcode session). The Session is shared with `browser_execute`
// via `SessionStore`. Returns the public bits the agent needs.
export const open = Effect.fn("CloudBrowser.open")(function* (
  sessionID: string,
  args: ProvisionParameters,
) {
  const { id, cdpUrl, liveUrl } = yield* provision(args)
  const session = SessionStore.get(sessionID)
  SessionStore.onEvict(sessionID, () =>
    Effect.runPromise(stop(id).pipe(Effect.ignore)),
  )
  yield* Effect.tryPromise({
    try: () => session.connect({ wsUrl: cdpUrl }),
    catch: (err) => (err instanceof Error ? err : new Error(String(err))),
  })
  return { id, liveUrl } as const
})

export * as CloudBrowser from "./cloud-browser"
