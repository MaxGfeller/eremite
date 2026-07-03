import { CollectionSnapshot, DraftCollection } from './collection'
import type { CollectionsDef } from './collection'
import { collectRefs, mintRef, substituteRefs, uuidv7 } from './ids'
import type { Ref } from './ids'
import { defaultStorage } from './storage'
import type { StorageAdapter } from './storage'
import { acquireLeadership, TabChannel, withLock } from './tabs'
import type { TabMessage } from './tabs'
import type {
  Conflict, MutateApi, MutationHandle, MutationOutcome, MutatorCtx, MutatorsDef,
  OpRecord, PushErrorVerdict, SnapshotOf, Store, StoreConfig, SyncStatus, Tx
} from './types'

interface RebaseResult {
  results: Map<string, unknown>
  failures: Array<{ op: OpRecord, error: unknown }>
}

const DEFAULT_MAX_ATTEMPTS = 5
const DEFAULT_BASE_DELAY = 1000
const DEFAULT_MAX_DELAY = 30000

export function createStore<C extends CollectionsDef, M extends MutatorsDef<C>> (
  config: StoreConfig<C, M>
): Store<C, M> {
  return new EremiteStore(config) as unknown as Store<C, M>
}

class EremiteStore<C extends CollectionsDef, M extends MutatorsDef<C>> {
  readonly ready: Promise<void>
  readonly mutate: MutateApi<C, M>

  private readonly cfg: StoreConfig<C, M>
  private readonly storage: StorageAdapter | null
  private readonly collectionNames: string[]
  private readonly lockName: string

  /** Server-confirmed state. Never contains optimistic changes or refs. */
  private base: Record<string, Map<string, any>> = {}
  /** The outbox: pending ops in execution order. */
  private ops: OpRecord[] = []
  private idMap = new Map<Ref, string | number>()
  private conflictList: Conflict[] = []
  /** Ops committed or dropped this session; guards against re-adoption from storage. */
  private readonly completedIds = new Set<string>()
  private readonly doneResolvers = new Map<string, (outcome: MutationOutcome) => void>()

  private snapshotCache: Record<string, CollectionSnapshot<any>> = {}
  private readonly listeners = new Set<() => void>()

  private hydrated = false
  private closed = false
  private online: boolean
  private isLeader = false
  private pushing: Promise<void> | null = null
  private consecutiveNetworkFailures = 0
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private probeTimer: ReturnType<typeof setTimeout> | null = null

  private readonly releaseLeadership: () => void
  private readonly channel: TabChannel

  constructor (config: StoreConfig<C, M>) {
    this.cfg = config
    this.collectionNames = Object.keys(config.collections)
    this.lockName = `eremite:${config.name}:ops`
    this.storage = config.storage === null ? null : (config.storage ?? defaultStorage(config.name))
    this.online = typeof navigator !== 'undefined' && 'onLine' in navigator ? navigator.onLine : true

    for (const name of this.collectionNames) this.base[name] = new Map()

    const mutate: Record<string, (input: unknown) => MutationHandle<unknown>> = {}
    for (const name of Object.keys(config.mutators)) {
      mutate[name] = (input: unknown) => this.enqueue(name, input)
    }
    this.mutate = mutate as MutateApi<C, M>

    this.channel = new TabChannel(config.name, message => { this.onTabMessage(message) })

    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.onBrowserOnline)
      window.addEventListener('offline', this.onBrowserOffline)
    }

    this.rebase()
    this.ready = this.hydrate()

    const multiTab = config.multiTab ?? (typeof navigator !== 'undefined' && 'locks' in navigator)
    if (multiTab) {
      this.releaseLeadership = acquireLeadership(`eremite:${config.name}:leader`, () => {
        this.isLeader = true
        void this.ready.then(() => { void this.kickPush() })
      })
    } else {
      this.isLeader = true
      this.releaseLeadership = () => {}
    }
  }

  // ---------------------------------------------------------------- public

  id (): string {
    return uuidv7()
  }

  get snapshot (): SnapshotOf<C> {
    return this.snapshotCache as SnapshotOf<C>
  }

  get status (): SyncStatus {
    return {
      online: this.online,
      syncing: this.pushing !== null,
      pendingOps: this.ops.length
    }
  }

  get conflicts (): Conflict[] {
    return [...this.conflictList]
  }

  get pendingOps (): OpRecord[] {
    return this.ops.map(op => ({ ...op, refs: { ...op.refs } }))
  }

  subscribe (listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  setOnline (online: boolean): void {
    if (this.online === online) return
    this.online = online
    if (online) {
      this.consecutiveNetworkFailures = 0
      void this.kickPush()
    }
    this.notify()
  }

  async flush (): Promise<void> {
    await this.ready
    await this.kickPush()
  }

  async pull (name: string, args?: unknown): Promise<unknown> {
    const def = this.cfg.pulls?.[name]
    if (!def) throw new Error(`Pull \`${name}\` is not defined`)

    const result = await def.fetch(args)
    if (this.closed) return result

    const drafts = this.makeDrafts()
    def.write(drafts as unknown as Tx<C>, result, args)
    await this.applyDraftsToBase(drafts)

    const { failures } = this.rebase()
    this.notify()
    this.handleReplayFailures(failures)
    this.channel.post({ t: 'state-changed' })
    return result
  }

  retryConflict (opId: string): void {
    const index = this.conflictList.findIndex(c => c.op.id === opId)
    if (index === -1) return

    const [conflict] = this.conflictList.splice(index, 1)
    const op: OpRecord = { ...conflict.op, refs: { ...conflict.op.refs }, attempts: 0 }
    this.completedIds.delete(op.id)
    this.ops.push(op)

    const { failures } = this.rebase()
    this.notify()
    this.handleReplayFailures(failures)
    void this.persistConflicts()
    void this.persistOps().then(() => {
      this.channel.post({ t: 'ops-changed' })
      void this.kickPush()
    })
  }

  discardConflict (opId: string): void {
    const index = this.conflictList.findIndex(c => c.op.id === opId)
    if (index === -1) return
    this.conflictList.splice(index, 1)
    void this.persistConflicts()
    this.notify()
  }

  close (): void {
    this.closed = true
    if (this.retryTimer) clearTimeout(this.retryTimer)
    if (this.probeTimer) clearTimeout(this.probeTimer)
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.onBrowserOnline)
      window.removeEventListener('offline', this.onBrowserOffline)
    }
    this.releaseLeadership()
    this.channel.close()
    this.listeners.clear()
  }

  // --------------------------------------------------------------- enqueue

  private enqueue (mutatorName: string, input: unknown): MutationHandle<unknown> {
    if (this.closed) throw new Error('Store is closed')

    let clonedInput: unknown
    try {
      clonedInput = input === undefined ? undefined : structuredClone(input)
    } catch {
      throw new Error(`Input for \`${mutatorName}\` must be structured-cloneable (no functions, DOM nodes, …)`)
    }

    const op: OpRecord = {
      id: uuidv7(),
      mutator: mutatorName,
      input: clonedInput,
      refs: {},
      attempts: 0,
      enqueuedAt: Date.now()
    }

    this.ops.push(op)
    const { results, failures } = this.rebase()

    const ownFailure = failures.find(f => f.op.id === op.id)
    if (ownFailure) {
      this.ops = this.ops.filter(o => o.id !== op.id)
      this.rebase()
      throw ownFailure.error
    }

    const done = new Promise<MutationOutcome>(resolve => {
      this.doneResolvers.set(op.id, resolve)
    })

    this.notify()
    this.handleReplayFailures(failures)
    void this.persistOps().then(() => {
      this.channel.post({ t: 'ops-changed' })
      void this.kickPush()
    })

    return { opId: op.id, result: results.get(op.id), done }
  }

  // ---------------------------------------------------------------- rebase

  /**
   * Derive the optimistic snapshot: start from base state (structurally
   * shared) and replay every pending op in order. Pure — mutators must not
   * have side effects; refs are minted once at enqueue time and merely
   * recalled here on subsequent replays.
   */
  private rebase (): RebaseResult {
    const drafts = this.makeDrafts()
    const results = new Map<string, unknown>()
    const failures: Array<{ op: OpRecord, error: unknown }> = []

    for (const op of this.ops) {
      const mutator = this.cfg.mutators[op.mutator]
      if (!mutator) {
        failures.push({ op, error: new Error(`Unknown mutator \`${op.mutator}\``) })
        continue
      }

      const input = substituteRefs(op.input, ref => this.idMap.get(ref))
      const ctx: MutatorCtx = {
        phase: 'optimistic',
        ref: (label: string) => {
          let ref = op.refs[label]
          if (!ref) {
            ref = mintRef()
            op.refs[label] = ref
          }
          const resolved = this.idMap.get(ref)
          return resolved !== undefined ? String(resolved) : ref
        }
      }

      try {
        results.set(op.id, mutator(drafts as unknown as Tx<C>, input, ctx))
      } catch (error) {
        failures.push({ op, error })
      }
    }

    const snapshot: Record<string, CollectionSnapshot<any>> = {}
    for (const name of this.collectionNames) {
      const draft = drafts[name]
      let map = draft.result()
      if (draft.written.size > 0) {
        map = new Map(map)
        for (const id of draft.written) {
          const entity = map.get(id)
          if (entity !== undefined) map.set(id, { ...entity, $pending: true })
        }
      }
      snapshot[name] = new CollectionSnapshot(map)
    }
    this.snapshotCache = snapshot

    return { results, failures }
  }

  private makeDrafts (): Record<string, DraftCollection<any>> {
    const drafts: Record<string, DraftCollection<any>> = {}
    for (const name of this.collectionNames) {
      drafts[name] = new DraftCollection(this.base[name])
    }
    return drafts
  }

  /** Ops whose mutator threw during a replay can never commit — drop them. */
  private handleReplayFailures (failures: Array<{ op: OpRecord, error: unknown }>): void {
    for (const failure of failures) {
      if (this.ops.some(o => o.id === failure.op.id)) {
        void this.dropOp(failure.op, 'replay-failed', failure.error)
      }
    }
  }

  // ------------------------------------------------------------- push loop

  private kickPush (): Promise<void> {
    if (!this.hydrated || !this.isLeader || this.closed || !this.online) {
      return this.pushing ?? Promise.resolve()
    }
    if (this.pushing) return this.pushing

    this.pushing = this.pushLoop()
      .catch(error => { console.error('[eremite] push loop failed unexpectedly:', error) })
      .finally(() => { this.pushing = null; this.notify() })
    this.notify()
    return this.pushing
  }

  private async pushLoop (): Promise<void> {
    while (!this.closed && this.online && this.ops.length > 0) {
      const op = this.ops[0]
      const input = substituteRefs(op.input, ref => this.idMap.get(ref))

      // Refs produced by this op itself are fine; any other unresolved ref
      // means the producing op is gone (dropped or discarded) — orphan.
      const ownRefs = new Set(Object.values(op.refs))
      const unresolved = [...collectRefs(input)].filter(ref => !this.idMap.has(ref) && !ownRefs.has(ref))
      if (unresolved.length > 0) {
        await this.dropOp(op, 'unresolved-reference',
          new Error(`Input references unresolved ID(s) ${unresolved.join(', ')} — the producing operation failed`))
        continue
      }

      const handler = this.cfg.push?.[op.mutator]
      if (handler) {
        try {
          await handler({
            input: input as never,
            op: { id: op.id, mutator: op.mutator, enqueuedAt: op.enqueuedAt, attempt: op.attempts + 1 },
            idempotencyKey: op.id,
            resolve: (label, realId) => { this.resolveRef(op, label, realId) }
          })
          this.consecutiveNetworkFailures = 0
        } catch (error) {
          const verdict = this.classifyPushError(error, op)

          if (verdict === 'offline') {
            this.goOffline()
            return
          }

          if (verdict === 'retry') {
            op.attempts++
            const maxAttempts = this.cfg.retry?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
            if (op.attempts >= maxAttempts) {
              await this.dropOp(op, 'push-failed', error)
              continue
            }
            await this.persistOps()
            this.scheduleRetry(this.backoffDelay(op.attempts))
            return
          }

          await this.dropOp(op, 'rejected', error)
          continue
        }

        for (const [label, ref] of Object.entries(op.refs)) {
          if (!this.idMap.has(ref)) {
            console.warn(`[eremite] Push for \`${op.mutator}\` succeeded without resolving ref '${label}'. ` +
              'Call ctx.resolve(label, realId) in the push handler, or later operations cannot reference this entity.')
          }
        }
      }

      await this.commitOp(op)
    }
  }

  private classifyPushError (error: unknown, op: OpRecord): PushErrorVerdict {
    const custom = this.cfg.onPushError?.(error, { op, attempt: op.attempts + 1 })
    if (custom) return custom

    const status: unknown = (error as any)?.status ?? (error as any)?.response?.status
    if (typeof status === 'number') {
      if (status === 408 || status === 425 || status === 429 || status >= 500) return 'retry'
      if (status >= 400) return 'drop'
      return 'retry'
    }
    // fetch() throws TypeError on network failure
    if (error instanceof TypeError) return 'offline'
    return 'retry'
  }

  private goOffline (): void {
    this.online = false
    this.consecutiveNetworkFailures++
    this.notify()

    const delay = this.backoffDelay(this.consecutiveNetworkFailures)
    if (this.probeTimer) clearTimeout(this.probeTimer)
    this.probeTimer = setTimeout(() => {
      if (this.closed || this.online) return
      this.online = true
      this.notify()
      void this.kickPush()
    }, delay)
  }

  private scheduleRetry (delay: number): void {
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.retryTimer = setTimeout(() => {
      if (!this.closed) void this.kickPush()
    }, delay)
  }

  private backoffDelay (attempt: number): number {
    const base = this.cfg.retry?.baseDelayMs ?? DEFAULT_BASE_DELAY
    const max = this.cfg.retry?.maxDelayMs ?? DEFAULT_MAX_DELAY
    return Math.min(base * 2 ** Math.max(0, attempt - 1), max)
  }

  private resolveRef (op: OpRecord, label: string, realId: string | number): void {
    const ref = op.refs[label]
    if (!ref) {
      throw new Error(`Unknown ref label '${label}' — the mutator for \`${op.mutator}\` never called ctx.ref('${label}')`)
    }
    this.idMap.set(ref, realId)
    void this.persistIdMap()
  }

  // -------------------------------------------------------- commit & drop

  /**
   * Apply the op's mutation to base state with fully resolved IDs, persist
   * the changed records, and remove the op from the outbox.
   */
  private async commitOp (op: OpRecord): Promise<void> {
    // The op may have been dropped (e.g. by a replay failure) while its push
    // was in flight; never commit an op that already left the outbox.
    if (!this.ops.some(o => o.id === op.id)) return

    const mutator = this.cfg.mutators[op.mutator]
    const input = substituteRefs(op.input, ref => this.idMap.get(ref))
    const drafts = this.makeDrafts()
    const ctx: MutatorCtx = {
      phase: 'commit',
      ref: (label: string) => {
        const ref = op.refs[label]
        if (!ref) throw new Error(`Unknown ref label '${label}'`)
        const resolved = this.idMap.get(ref)
        return resolved !== undefined ? String(resolved) : ref
      }
    }

    try {
      mutator(drafts as unknown as Tx<C>, input, ctx)
    } catch (error) {
      await this.dropOp(op, 'commit-failed', error)
      return
    }

    await this.applyDraftsToBase(drafts)
    this.removeOp(op.id)
    await this.persistOps()

    const { failures } = this.rebase()
    this.notify()
    this.handleReplayFailures(failures)

    this.settleDone(op.id, { status: 'committed' })
    this.channel.post({ t: 'state-changed' })
    this.channel.post({ t: 'op-done', opId: op.id, status: 'committed' })
  }

  /**
   * Remove a failed op and record it as a conflict. Later ops whose input
   * references an ID this op was supposed to produce are dropped with it,
   * transitively, so the app gets one coherent group of conflicts.
   */
  private async dropOp (op: OpRecord, reason: Conflict['reason'], error?: unknown): Promise<void> {
    if (!this.ops.some(o => o.id === op.id)) return
    this.removeOp(op.id)

    const message = error instanceof Error ? error.message : (error !== undefined ? String(error) : undefined)
    this.conflictList.push({
      op: { ...op, refs: { ...op.refs } },
      reason,
      message,
      at: Date.now()
    })

    const orphanedRefs = Object.values(op.refs).filter(ref => !this.idMap.has(ref))
    if (orphanedRefs.length > 0) {
      const orphanSet = new Set(orphanedRefs)
      let dependent: OpRecord | undefined
      while ((dependent = this.ops.find(o => [...collectRefs(o.input)].some(ref => orphanSet.has(ref)))) !== undefined) {
        await this.dropOp(dependent, 'dependency-failed',
          new Error(`Depends on \`${op.mutator}\` (${op.id}), which was dropped`))
        // The recursive call handles that op's own orphaned refs.
      }
    }

    await this.persistOps()
    await this.persistConflicts()

    const { failures } = this.rebase()
    this.notify()
    this.handleReplayFailures(failures)

    this.settleDone(op.id, { status: 'dropped', reason, message })
    this.channel.post({ t: 'state-changed' })
    this.channel.post({ t: 'op-done', opId: op.id, status: 'dropped', reason })
  }

  private removeOp (opId: string): void {
    this.ops = this.ops.filter(o => o.id !== opId)
    this.completedIds.add(opId)
  }

  private settleDone (opId: string, outcome: MutationOutcome): void {
    const resolve = this.doneResolvers.get(opId)
    if (resolve) {
      this.doneResolvers.delete(opId)
      resolve(outcome)
    }
  }

  private async applyDraftsToBase (drafts: Record<string, DraftCollection<any>>): Promise<void> {
    for (const name of this.collectionNames) {
      const draft = drafts[name]
      if (!draft.changed) continue

      const map = draft.result()
      this.base[name] = map

      if (this.storage) {
        for (const id of draft.written) {
          await this.storage.set(`b:${name}:${id}`, map.get(id))
        }
        for (const id of draft.deleted) {
          await this.storage.delete(`b:${name}:${id}`)
        }
      }
    }
  }

  // ----------------------------------------------------------- persistence

  /**
   * Write the outbox. Runs under a cross-tab lock and adopts ops another
   * tab appended in the meantime, so concurrent writers never lose ops.
   */
  private async persistOps (): Promise<void> {
    if (!this.storage) return

    let adopted = false
    await withLock(this.lockName, async () => {
      const stored = (await this.storage!.get('ops')) as OpRecord[] | undefined
      if (stored) {
        for (const storedOp of stored) {
          const known = this.ops.some(o => o.id === storedOp.id) ||
            this.completedIds.has(storedOp.id) ||
            this.conflictList.some(c => c.op.id === storedOp.id)
          if (!known) {
            this.ops.push(storedOp)
            adopted = true
          }
        }
        if (adopted) this.ops.sort((a, b) => a.enqueuedAt - b.enqueuedAt)
      }
      await this.storage!.set('ops', this.ops.map(op => ({ ...op, refs: { ...op.refs } })))
    }).catch(error => { console.error('[eremite] failed to persist outbox:', error) })

    if (adopted) {
      const { failures } = this.rebase()
      this.notify()
      this.handleReplayFailures(failures)
      void this.kickPush()
    }
  }

  private async persistIdMap (): Promise<void> {
    if (!this.storage) return
    await this.storage.set('idmap', Object.fromEntries(this.idMap))
      .catch(error => { console.error('[eremite] failed to persist ID map:', error) })
  }

  private async persistConflicts (): Promise<void> {
    if (!this.storage) return
    await this.storage.set('conflicts', this.conflictList)
      .catch(error => { console.error('[eremite] failed to persist conflicts:', error) })
  }

  private async hydrate (): Promise<void> {
    if (!this.storage) {
      this.hydrated = true
      return
    }

    try {
      const version = this.cfg.version ?? 1
      const meta = (await this.storage.get('meta')) as { version?: number } | undefined
      if (meta?.version !== version) {
        if (meta !== undefined || version !== 1) {
          if (this.cfg.onVersionChange) {
            await this.cfg.onVersionChange(meta?.version ?? null, version, this.storage)
          } else {
            for (const [key] of await this.storage.entries('b:')) {
              await this.storage.delete(key)
            }
          }
        }
        await this.storage.set('meta', { version })
      }

      const idMapDoc = (await this.storage.get('idmap')) as Record<string, string | number> | undefined
      if (idMapDoc) this.idMap = new Map(Object.entries(idMapDoc))

      const conflicts = (await this.storage.get('conflicts')) as Conflict[] | undefined
      if (conflicts) this.conflictList = conflicts

      for (const [key, value] of await this.storage.entries('b:')) {
        const rest = key.slice(2)
        const sep = rest.indexOf(':')
        if (sep === -1) continue
        const collectionName = rest.slice(0, sep)
        const id = rest.slice(sep + 1)
        if (this.base[collectionName]) this.base[collectionName].set(id, value)
      }
    } catch (error) {
      console.error('[eremite] failed to hydrate from storage:', error)
    }

    this.hydrated = true

    // Adopts persisted ops (they sort before this session's by enqueuedAt)
    // and writes the merged outbox back.
    await this.persistOps()

    const { failures } = this.rebase()
    this.notify()
    this.handleReplayFailures(failures)
    void this.kickPush()
  }

  // -------------------------------------------------------------- multi-tab

  private onTabMessage (message: TabMessage): void {
    if (this.closed) return

    if (message.t === 'ops-changed') {
      // Another tab appended to the outbox; merge and (if leader) push.
      void this.persistOps()
    } else if (message.t === 'state-changed') {
      void this.reloadFromStorage()
    } else if (message.t === 'op-done') {
      this.settleDone(message.opId, message.status === 'committed'
        ? { status: 'committed' }
        : { status: 'dropped', reason: (message.reason as Conflict['reason']) ?? 'rejected' })
    }
  }

  /** Re-read base state, outbox, ID map and conflicts after another tab changed them. */
  private async reloadFromStorage (): Promise<void> {
    if (!this.storage || !this.hydrated) return

    try {
      const idMapDoc = (await this.storage.get('idmap')) as Record<string, string | number> | undefined
      if (idMapDoc) this.idMap = new Map(Object.entries(idMapDoc))

      const conflicts = (await this.storage.get('conflicts')) as Conflict[] | undefined
      if (conflicts) this.conflictList = conflicts

      const fresh: Record<string, Map<string, any>> = {}
      for (const name of this.collectionNames) fresh[name] = new Map()
      for (const [key, value] of await this.storage.entries('b:')) {
        const rest = key.slice(2)
        const sep = rest.indexOf(':')
        if (sep === -1) continue
        const collectionName = rest.slice(0, sep)
        const id = rest.slice(sep + 1)
        if (fresh[collectionName]) fresh[collectionName].set(id, value)
      }
      this.base = fresh

      const stored = (await this.storage.get('ops')) as OpRecord[] | undefined
      if (stored) {
        this.ops = stored.filter(op => !this.completedIds.has(op.id))
      }

      this.rebase()
      this.notify()
    } catch (error) {
      console.error('[eremite] failed to reload after cross-tab change:', error)
    }
  }

  // ----------------------------------------------------------------- misc

  private notify (): void {
    for (const listener of this.listeners) listener()
  }

  private readonly onBrowserOnline = (): void => { this.setOnline(true) }
  private readonly onBrowserOffline = (): void => { this.setOnline(false) }
}
