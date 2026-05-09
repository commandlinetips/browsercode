// fetch-use — Effect service that proxies HTTP requests through Browser Use's
// fetch-use cloud (Chrome JA4 fingerprint, HTTP/2 header order, session-based
// cookie persistence). See `memory/browsercode/fetch_use_reference.md` for
// the API shape; decisions.md §3.3 + ROADMAP B1 for the rationale.
//
// The layer is always constructible. `enabled` reflects whether
// BROWSER_USE_API_KEY is set and the user hasn't opted out via
// BCODE_NO_FETCH_USE=1. Consumers (webfetch.ts) check `enabled` and fall back
// to native HttpClient when false.

import { Context, Effect, Layer } from "effect"
import { HttpClient, HttpClientRequest } from "effect/unstable/http"

const ENDPOINT = "https://fetch.browser-use.com/fetch"
const DEFAULT_TIMEOUT_MS = 30_000

// Mirrors the Go FetchResponse type at
// github.com/browser-use/fetch-use/internal/types/types.go. `headers` is
// http.Header — `map[string][]string` over the wire — so each value is an
// array of strings, not a single string.
interface FetchUseRaw {
  status_code: number
  headers?: Record<string, string[]>
  body?: string
  body_base64?: string
  is_binary?: boolean
  error?: string
}

export interface FetchOptions {
  readonly timeoutMs?: number
}

export interface FetchResult {
  readonly body: ArrayBuffer
  readonly contentType: string
  readonly statusCode: number
}

export interface Interface {
  readonly enabled: boolean
  readonly fetch: (url: string, opts?: FetchOptions) => Effect.Effect<FetchResult, Error>
}

export class Service extends Context.Service<Service, Interface>()("@browser-use/FetchUse") {}

const headerValue = (h: Record<string, string[]> | undefined, key: string): string => {
  if (!h) return ""
  for (const [k, v] of Object.entries(h)) {
    if (k.toLowerCase() === key.toLowerCase()) return v[0] ?? ""
  }
  return ""
}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const http = yield* HttpClient.HttpClient
    const apiKey = process.env.BROWSER_USE_API_KEY ?? ""
    const enabled = apiKey.length > 0 && process.env.BCODE_NO_FETCH_USE !== "1"

    const fetch = (url: string, opts?: FetchOptions) =>
      Effect.gen(function* () {
        const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS
        const request = yield* HttpClientRequest.post(ENDPOINT).pipe(
          HttpClientRequest.setHeaders({
            "Content-Type": "application/json",
            "X-Browser-Use-API-Key": apiKey,
          }),
          HttpClientRequest.bodyJson({ url, timeout_ms: timeoutMs }),
        )
        const response = yield* HttpClient.filterStatusOk(http).execute(request)
        const data = (yield* response.json) as unknown as FetchUseRaw
        if (data.error) return yield* Effect.fail(new Error(`fetch-use: ${data.error}`))

        const body =
          data.is_binary && data.body_base64
            ? new Uint8Array(Buffer.from(data.body_base64, "base64")).buffer
            : new TextEncoder().encode(data.body ?? "").buffer

        return {
          body: body as ArrayBuffer,
          contentType: headerValue(data.headers, "Content-Type"),
          statusCode: data.status_code,
        }
      }).pipe(Effect.mapError((e) => (e instanceof Error ? e : new Error(String(e)))))

    return Service.of({ enabled, fetch })
  }),
)

export * as FetchUse from "./fetch-use"
