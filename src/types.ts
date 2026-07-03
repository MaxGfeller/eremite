import type { CollectionsDef, CollectionSnapshot, DraftCollection, EntityOf, WithPending } from './collection'
import type { Ref } from './ids'
import type { StorageAdapter } from './storage'

/**
 * A persisted operation in the outbox: mutator name + input, replayable
 * across reloads. `refs` maps the labels passed to `ctx.ref(label)` to the
 * placeholder IDs minted for them (minted exactly once, at enqueue time).
 */
export interface OpRecord {
  id: string
  mutator: string
  input: unknown
  refs: Record<string, Ref>
  attempts: number
  enqueuedAt: number
}

export interface Conflict {
  op: OpRecord
  /**
   * - `rejected`: the server refused the operation (non-retryable error)
   * - `push-failed`: retries exhausted
   * - `dependency-failed`: an operation this one depends on was dropped
   * - `unresolved-reference`: the input references an ID that can no longer
   *   be resolved (the producing operation is gone)
   * - `commit-failed` / `replay-failed`: the mutator itself threw
   */
  reason: 'rejected' | 'push-failed' | 'dependency-failed' | 'unresolved-reference' | 'commit-failed' | 'replay-failed'
  message?: string
  at: number
}

export type MutationOutcome =
  | { status: 'committed' }
  | { status: 'dropped', reason: Conflict['reason'], message?: string }

export interface MutationHandle<R> {
  opId: string
  /** Return value of the mutator's first (optimistic) run. */
  result: R
  /** Settles when the op is committed or dropped. Never rejects. */
  done: Promise<MutationOutcome>
}

/** The transactional draft over all collections that mutators write to. */
export type Tx<C extends CollectionsDef> = {
  [K in keyof C]: DraftCollection<EntityOf<C[K]>>
}

export interface MutatorCtx {
  /**
   * Mint (or recall) the placeholder for a server-assigned ID. Returns the
   * ref while unresolved and the real ID once the push has resolved it, so
   * commit replays write the entity under its final key.
   */
  ref: (label: string) => string
  /** 'optimistic' while pending (including every rebase replay), 'commit' when entering base state. */
  phase: 'optimistic' | 'commit'
}

export type Mutator<C extends CollectionsDef> = (tx: Tx<C>, input: any, ctx: MutatorCtx) => any
export type MutatorsDef<C extends CollectionsDef> = Record<string, Mutator<C>>

export type InputOf<M> = M extends (tx: any, input: infer I, ...rest: any[]) => any ? I : never
export type ResultOf<M> = M extends (...args: any[]) => infer R ? R : never

export interface PushCtx<I> {
  /** The op's input with every resolved ref already substituted. */
  input: I
  op: { id: string, mutator: string, enqueuedAt: number, attempt: number }
  /** Equal to the op ID; send it so server-side dedup makes retries safe. */
  idempotencyKey: string
  /** Report the server-assigned ID for a ref minted via `ctx.ref(label)`. */
  resolve: (label: string, realId: string | number) => void
}

export type PushHandler<I> = (ctx: PushCtx<I>) => Promise<void> | void

export interface PullDef<C extends CollectionsDef, A, R> {
  fetch: (args: A) => Promise<R>
  /** Write the fetched data into base state. Runs atomically after `fetch`. */
  write: (tx: Tx<C>, result: R, args: A) => void
}

export type PushErrorVerdict = 'retry' | 'drop' | 'offline'

export interface RetryConfig {
  /** Attempts before a retryable failure becomes a conflict. Default 5. */
  maxAttempts?: number
  /** First backoff delay in ms. Default 1000. */
  baseDelayMs?: number
  /** Backoff ceiling in ms. Default 30000. */
  maxDelayMs?: number
}

export interface StoreConfig<C extends CollectionsDef, M extends MutatorsDef<C>> {
  name: string
  /** Bump to invalidate persisted base state (ops are kept). Default 1. */
  version?: number
  /**
   * Storage adapter. Defaults to IndexedDB in the browser and an in-memory
   * adapter elsewhere. Pass `null` to disable persistence entirely.
   */
  storage?: StorageAdapter | null
  collections: C
  mutators: M
  /**
   * Network effect per mutator. Omitting a mutator makes it local-only: it
   * commits to base state as soon as the queue reaches it.
   */
  push?: { [K in keyof M]?: PushHandler<InputOf<M[K]>> }
  pulls?: Record<string, PullDef<C, any, any>>
  retry?: RetryConfig
  /**
   * Classify a push error. Return nothing to use the default policy:
   * network errors → 'offline', HTTP 408/425/429/5xx → 'retry',
   * other 4xx → 'drop', unknown errors → 'retry'.
   */
  onPushError?: (error: unknown, ctx: { op: OpRecord, attempt: number }) => PushErrorVerdict | undefined
  /** Coordinate push leadership across tabs. Default: true in the browser. */
  multiTab?: boolean
  /**
   * Called when the persisted `version` differs from the configured one.
   * Default behavior (no handler): drop persisted base state, keep the outbox.
   */
  onVersionChange?: (from: number | null, to: number, storage: StorageAdapter) => Promise<void> | void
}

export type SnapshotOf<C extends CollectionsDef> = {
  [K in keyof C]: CollectionSnapshot<WithPending<EntityOf<C[K]>>>
}

export type MutateApi<C extends CollectionsDef, M extends MutatorsDef<C>> = {
  [K in keyof M]: (input: InputOf<M[K]>) => MutationHandle<ResultOf<M[K]>>
}

export interface SyncStatus {
  online: boolean
  syncing: boolean
  pendingOps: number
}

export interface Store<C extends CollectionsDef, M extends MutatorsDef<C>> {
  /** Resolves once persisted state has been loaded. */
  ready: Promise<void>
  /** Mint a client-generated permanent ID (UUIDv7). */
  id: () => string
  mutate: MutateApi<C, M>
  pull: (name: string, args?: unknown) => Promise<unknown>
  readonly snapshot: SnapshotOf<C>
  readonly status: SyncStatus
  readonly conflicts: Conflict[]
  readonly pendingOps: OpRecord[]
  subscribe: (listener: () => void) => () => void
  setOnline: (online: boolean) => void
  /** Kick the push loop and wait for it to settle (drained, offline or backing off). */
  flush: () => Promise<void>
  retryConflict: (opId: string) => void
  discardConflict: (opId: string) => void
  close: () => void
}
