// FetchUse smoke tests.
//
// Unit: layer is constructible, `enabled` reflects env vars correctly.
// Live: when BROWSER_USE_API_KEY is set, end-to-end POST to fetch.browser-use.com
//       returns body bytes + content-type. Skipped without the key.

import { expect, test } from "bun:test"
import { Effect, Layer } from "effect"
import { FetchHttpClient } from "effect/unstable/http"
import { FetchUse } from "../src/fetch-use"

const haveKey = !!process.env.BROWSER_USE_API_KEY

test("layer constructs and exposes `enabled`", async () => {
  const enabled = await Effect.gen(function* () {
    const svc = yield* FetchUse.Service
    return svc.enabled
  }).pipe(
    Effect.provide(FetchUse.layer.pipe(Layer.provide(FetchHttpClient.layer))),
    Effect.runPromise,
  )
  expect(typeof enabled).toBe("boolean")
  expect(enabled).toBe(haveKey && process.env.BCODE_NO_FETCH_USE !== "1")
})

test.skipIf(!haveKey)("live: fetches httpbin and returns body + content-type", async () => {
  const result = await Effect.gen(function* () {
    const svc = yield* FetchUse.Service
    return yield* svc.fetch("https://httpbin.org/get")
  }).pipe(
    Effect.provide(FetchUse.layer.pipe(Layer.provide(FetchHttpClient.layer))),
    Effect.runPromise,
  )

  expect(result.statusCode).toBe(200)
  expect(result.contentType).toContain("application/json")
  const text = new TextDecoder().decode(result.body)
  const data = JSON.parse(text)
  expect(data.url).toBe("https://httpbin.org/get")
})
