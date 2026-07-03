/**
 * React adapter for Eremite (`@eremitejs/react`).
 *
 * The core is framework-agnostic (immutable snapshots + subscribe); these
 * hooks bridge it into React via `useSyncExternalStore`. Snapshots are
 * immutable objects replaced on change, so re-renders are cheap and
 * tear-free.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { Conflict, SyncStatus } from '@eremitejs/core'

interface SubscribableStore {
  snapshot: unknown
  status: SyncStatus
  conflicts: Conflict[]
  subscribe: (listener: () => void) => () => void
  pull: (name: string, args?: unknown) => Promise<unknown>
}

/**
 * Re-render whenever the store changes; returns a monotonically increasing
 * version usable as a dependency.
 */
export function useStoreVersion (store: SubscribableStore): number {
  const versionRef = useRef(0)
  const subscribe = useCallback((onStoreChange: () => void) => {
    return store.subscribe(() => {
      versionRef.current++
      onStoreChange()
    })
  }, [store])

  const getVersion = useCallback(() => versionRef.current, [])
  return useSyncExternalStore(subscribe, getVersion, getVersion)
}

/**
 * Select from the store's optimistic snapshot; the component re-renders on
 * every store change and the selector runs against the latest snapshot.
 *
 *   const todos = useQuery(store, s => s.todos.where(t => !t.done))
 */
export function useQuery<S extends SubscribableStore, R> (
  store: S,
  selector: (snapshot: S['snapshot']) => R
): R {
  useStoreVersion(store)
  return selector(store.snapshot as S['snapshot'])
}

/**
 * Run a pull (server read) on mount and whenever `args` changes (compared
 * by value).
 *
 *   const { loading, error, refetch } = usePull(store, 'todos', { projectId })
 */
export function usePull (
  store: SubscribableStore,
  name: string,
  args?: unknown
): { loading: boolean, error: unknown, refetch: () => Promise<void> } {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)

  const argsRef = useRef(args)
  argsRef.current = args
  const argsKey = JSON.stringify(args) ?? ''

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      await store.pull(name, argsRef.current)
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, name, argsKey])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { loading, error, refetch }
}

/**
 * Reactive sync status: online flag, outbox depth, and conflicts.
 */
export function useSyncStatus (store: SubscribableStore): SyncStatus & { conflicts: Conflict[] } {
  const version = useStoreVersion(store)
  return useMemo(() => ({
    ...store.status,
    conflicts: store.conflicts
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [store, version])
}
