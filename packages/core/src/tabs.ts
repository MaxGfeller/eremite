/**
 * Multi-tab coordination.
 *
 * - `withLock` serializes read-modify-write cycles on shared documents (the
 *   op log) across tabs via the Web Locks API, with an in-process mutex
 *   fallback for non-browser environments.
 * - `acquireLeadership` elects exactly one tab as the *leader*: only the
 *   leader runs the push loop, so an action is never submitted twice.
 * - `TabChannel` is a thin BroadcastChannel wrapper used to tell the leader
 *   about newly enqueued ops and to tell followers about committed state.
 */

const inProcessLocks = new Map<string, Promise<void>>()

export async function withLock<T> (name: string, fn: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && 'locks' in navigator) {
    return await (navigator as Navigator & { locks: LockManager }).locks.request(name, fn as () => Promise<T>) as T
  }

  const previous = inProcessLocks.get(name) ?? Promise.resolve()
  let release!: () => void
  const current = new Promise<void>(resolve => { release = resolve })
  inProcessLocks.set(name, previous.then(async () => await current))

  await previous
  try {
    return await fn()
  } finally {
    release()
  }
}

/**
 * Requests leadership for `name`. `onAcquire` fires once this context becomes
 * the leader (immediately outside the browser, or when the previous leader
 * tab closes). Returns a release function.
 */
export function acquireLeadership (name: string, onAcquire: () => void): () => void {
  if (typeof navigator !== 'undefined' && 'locks' in navigator) {
    let released = false
    let release: (() => void) | null = null

    void (navigator as Navigator & { locks: LockManager }).locks.request(name, async () => {
      if (released) return
      onAcquire()
      await new Promise<void>(resolve => { release = resolve })
    })

    return () => {
      released = true
      release?.()
    }
  }

  onAcquire()
  return () => {}
}

export type TabMessage =
  | { t: 'ops-changed' }
  | { t: 'state-changed' }
  | { t: 'op-done', opId: string, status: 'committed' | 'dropped', reason?: string }

export class TabChannel {
  private readonly channel: BroadcastChannel | null
  private closed = false

  constructor (name: string, onMessage: (message: TabMessage) => void) {
    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(`eremite:${name}`)
      this.channel.onmessage = (event: MessageEvent<TabMessage>) => onMessage(event.data)
      // Node's BroadcastChannel keeps the event loop alive; don't let a
      // store hold a test runner or SSR process open.
      ;(this.channel as unknown as { unref?: () => void }).unref?.()
    } else {
      this.channel = null
    }
  }

  post (message: TabMessage): void {
    if (this.closed) return
    try {
      this.channel?.postMessage(message)
    } catch {
      // The channel can be torn down while async work is still settling.
    }
  }

  close (): void {
    this.closed = true
    this.channel?.close()
  }
}
