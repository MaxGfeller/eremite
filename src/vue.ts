/**
 * Vue 3 adapter. Import from `@eremitejs/eremite/vue`.
 *
 * The core is framework-agnostic (immutable snapshots + subscribe); these
 * composables bridge it into Vue's reactivity via a version counter, so
 * component updates are driven by shallow ref changes instead of deep
 * reactive proxies over the whole store.
 */
import {
  computed, getCurrentScope, onScopeDispose, ref, shallowRef, watch, toValue
} from 'vue'
import type { ComputedRef, MaybeRefOrGetter, Ref, ShallowRef } from 'vue'
import type { Conflict, SyncStatus } from './types'

interface SubscribableStore {
  snapshot: unknown
  status: SyncStatus
  conflicts: Conflict[]
  subscribe: (listener: () => void) => () => void
  pull: (name: string, args?: unknown) => Promise<unknown>
}

function useStoreVersion (store: SubscribableStore): Ref<number> {
  const version = ref(0)
  const unsubscribe = store.subscribe(() => { version.value++ })
  if (getCurrentScope()) onScopeDispose(unsubscribe)
  return version
}

/**
 * Reactive selection over the store's optimistic snapshot.
 *
 *   const todos = useQuery(store, s => s.todos.where(t => !t.done))
 */
export function useQuery<S extends SubscribableStore, R> (
  store: S,
  selector: (snapshot: S['snapshot']) => R
): ComputedRef<R> {
  const version = useStoreVersion(store)
  return computed(() => {
    void version.value
    return selector(store.snapshot as S['snapshot'])
  })
}

/**
 * Run a pull (server read) and re-run it whenever `args` changes.
 *
 *   const { loading, error, refetch } = usePull(store, 'todos', () => ({ projectId: props.id }))
 */
export function usePull (
  store: SubscribableStore,
  name: string,
  args?: MaybeRefOrGetter<unknown>
): { loading: Ref<boolean>, error: ShallowRef<unknown>, refetch: () => Promise<void> } {
  const loading = ref(false)
  const error = shallowRef<unknown>(null)

  const refetch = async (): Promise<void> => {
    loading.value = true
    error.value = null
    try {
      await store.pull(name, toValue(args))
    } catch (err) {
      error.value = err
    } finally {
      loading.value = false
    }
  }

  if (args !== undefined) {
    watch(() => toValue(args), () => { void refetch() }, { deep: true })
  }
  void refetch()

  return { loading, error, refetch }
}

/**
 * Reactive sync status: online flag, outbox depth, and conflicts.
 */
export function useSyncStatus (store: SubscribableStore): {
  online: ComputedRef<boolean>
  syncing: ComputedRef<boolean>
  pendingOps: ComputedRef<number>
  conflicts: ComputedRef<Conflict[]>
} {
  const version = useStoreVersion(store)
  const track = <T>(get: () => T): ComputedRef<T> => computed(() => {
    void version.value
    return get()
  })

  return {
    online: track(() => store.status.online),
    syncing: track(() => store.status.syncing),
    pendingOps: track(() => store.status.pendingOps),
    conflicts: track(() => store.conflicts)
  }
}
