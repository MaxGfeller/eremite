import { afterEach, expect, test } from 'vitest'
import { effectScope } from 'vue'
import { collection, createStore, memoryStorage } from '@eremitejs/core'
import type { Store, Tx } from '@eremitejs/core'
import { useQuery, useSyncStatus } from '../src'

interface Todo { id: string, title: string, done: boolean }

const collections = { todos: collection<Todo>() }
type AppTx = Tx<typeof collections>

let stores: Array<Store<any, any>> = []
afterEach(() => {
  for (const store of stores) store.close()
  stores = []
})

function makeStore (name: string) {
  const store = createStore({
    name,
    storage: memoryStorage(),
    collections,
    mutators: {
      addTodo (tx: AppTx, input: Todo) { tx.todos.set(input.id, input) },
      toggleTodo (tx: AppTx, input: { id: string }) {
        tx.todos.update(input.id, t => { t.done = !t.done })
      }
    },
    push: { addTodo: () => {}, toggleTodo: () => {} }
  })
  stores.push(store)
  return store
}

test('useQuery recomputes when the store changes', async () => {
  const store = makeStore('vue-1')
  await store.ready

  const scope = effectScope()
  await scope.run(async () => {
    const openTodos = useQuery(store, s => s.todos.where(t => !t.done))
    expect(openTodos.value).toHaveLength(0)

    const handle = store.mutate.addTodo({ id: 't1', title: 'Reactive', done: false })
    expect(openTodos.value).toHaveLength(1)
    expect(openTodos.value[0]).toMatchObject({ title: 'Reactive', $pending: true })

    await handle.done
    expect(openTodos.value[0]?.$pending).toBeUndefined()

    await store.mutate.toggleTodo({ id: 't1' }).done
    expect(openTodos.value).toHaveLength(0)
  })
  scope.stop()
})

test('useSyncStatus tracks connectivity and outbox depth', async () => {
  const store = makeStore('vue-2')
  await store.ready

  const scope = effectScope()
  await scope.run(async () => {
    const { online, pendingOps } = useSyncStatus(store)
    expect(online.value).toBe(true)
    expect(pendingOps.value).toBe(0)

    store.setOnline(false)
    const handle = store.mutate.addTodo({ id: 't2', title: 'Queued', done: false })
    expect(online.value).toBe(false)
    expect(pendingOps.value).toBe(1)

    store.setOnline(true)
    await handle.done
    expect(pendingOps.value).toBe(0)
  })
  scope.stop()
})
