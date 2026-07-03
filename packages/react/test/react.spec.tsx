// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { collection, createStore, memoryStorage } from '@eremitejs/core'
import type { Store, Tx } from '@eremitejs/core'
import { useQuery, useSyncStatus } from '../src'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

interface Todo { id: string, title: string, done: boolean }

const collections = { todos: collection<Todo>() }
type AppTx = Tx<typeof collections>

let stores: Array<Store<any, any>> = []
let roots: Root[] = []
afterEach(() => {
  for (const root of roots) act(() => { root.unmount() })
  roots = []
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

function mount (element: React.ReactElement): HTMLElement {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  act(() => { root.render(element) })
  return container
}

test('useQuery re-renders when the store changes', async () => {
  const store = makeStore('react-1')
  await store.ready

  function OpenTodos () {
    const todos = useQuery(store, s => s.todos.where(t => !t.done))
    return (
      <ul>
        {todos.map(t => (
          <li key={t.id} data-pending={t.$pending ? 'yes' : 'no'}>{t.title}</li>
        ))}
      </ul>
    )
  }

  const container = mount(<OpenTodos />)
  expect(container.querySelectorAll('li')).toHaveLength(0)

  let handle!: ReturnType<typeof store.mutate.addTodo>
  act(() => {
    handle = store.mutate.addTodo({ id: 't1', title: 'Reactive', done: false })
  })
  expect(container.querySelector('li')?.textContent).toBe('Reactive')
  expect(container.querySelector('li')?.dataset.pending).toBe('yes')

  await act(async () => { await handle.done })
  expect(container.querySelector('li')?.dataset.pending).toBe('no')

  await act(async () => { await store.mutate.toggleTodo({ id: 't1' }).done })
  expect(container.querySelectorAll('li')).toHaveLength(0)
})

test('useSyncStatus tracks connectivity and outbox depth', async () => {
  const store = makeStore('react-2')
  await store.ready

  function Status () {
    const { online, pendingOps } = useSyncStatus(store)
    return <span>{online ? 'online' : 'offline'}:{pendingOps}</span>
  }

  const container = mount(<Status />)
  expect(container.textContent).toBe('online:0')

  let handle!: ReturnType<typeof store.mutate.addTodo>
  act(() => {
    store.setOnline(false)
    handle = store.mutate.addTodo({ id: 't2', title: 'Queued', done: false })
  })
  expect(container.textContent).toBe('offline:1')

  await act(async () => {
    store.setOnline(true)
    await handle.done
  })
  expect(container.textContent).toBe('online:0')
})
