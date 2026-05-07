// Process-scope per-opencode-session CDP Session map.
//
// Both `browser_execute` and `browser_open_cloud` look up the same `Session`
// by `sessionID` so a snippet that follows a `browser_open_cloud` call drives
// the cloud browser, not a freshly-auto-detected local one.
//
// Lifetime: Sessions persist for the life of the opencode process (or until
// the underlying WebSocket closes). We don't have a clean session-end hook
// in opencode's tool layer; the WS closes naturally on browser exit and the
// agent can call `session.close()` from a snippet if needed. Sessions held in
// the map after their browser exits become unusable but are cheap (just an
// idle WS reference until the next snippet replaces them).
//
// Evicted via `evict(sessionID)` if a future hook is added.

import { Session } from "./cdp/session"

interface Entry {
  readonly session: Session
  // Cleanup callbacks registered alongside the Session — e.g. cloud-browser
  // stop calls. Run sequentially on `evict`. Each is fire-and-forget and
  // must not throw outwards (errors are logged, not propagated).
  readonly cleanup: Array<() => Promise<void>>
}

const sessions = new Map<string, Entry>()

export const get = (sessionID: string): Session => {
  const existing = sessions.get(sessionID)
  if (existing) return existing.session
  const fresh = new Session()
  sessions.set(sessionID, { session: fresh, cleanup: [] })
  return fresh
}

export const onEvict = (sessionID: string, fn: () => Promise<void>): void => {
  const entry = sessions.get(sessionID)
  if (!entry) throw new Error(`SessionStore.onEvict: no session ${sessionID}`)
  entry.cleanup.push(fn)
}

export const evict = async (sessionID: string): Promise<void> => {
  const entry = sessions.get(sessionID)
  if (!entry) return
  sessions.delete(sessionID)
  for (const fn of entry.cleanup) {
    try { await fn() } catch (err) { console.error(`SessionStore evict cleanup failed for ${sessionID}:`, err) }
  }
  entry.session.close()
}

export * as SessionStore from "./session-store"
