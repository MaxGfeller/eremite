import { afterEach, expect, test } from 'vitest'
import { collection, createStore, memoryStorage } from '../src'
import type { Store, Tx } from '../src'
import { sleep } from './utils'

interface Todo { id: string, title: string, done: boolean }

const collections = { todos: collection<Todo>() }
type AppTx = Tx<typeof collections>

let stores: Array<Store<any, any>> = []
afterEach(() => {
  for (const store of stores) store.close()
  stores = []
})

test('pull writes server data into base state; pending ops stay layered on top', async () => {
  let serverTodos: Todo[] = [
    { id: '1', title: 'From server', done: false }
  ]

  const store = createStore({
    name: 'pull-1',
    storage: memoryStorage(),
    collections,
    mutators: {
      toggleTodo (tx: AppTx, input: { id: string }) {
        tx.todos.update(input.id, t => { t.done = !t.done })
      }
    },
    push: {
      toggleTodo: () => {}
    },
    pulls: {
      todos: {
        fetch: async () => serverTodos,
        write: (tx, result: Todo[]) => {
          for (const todo of result) tx.todos.set(todo.id, todo)
        }
      }
    }
  })
  stores.push(store)
  await store.ready

  await store.pull('todos')
  expect(store.snapshot.todos.get('1')).toMatchObject({ title: 'From server', done: false })

  // go offline, toggle optimistically
  store.setOnline(false)
  store.mutate.toggleTodo({ id: '1' })
  expect(store.snapshot.todos.get('1')).toMatchObject({ done: true, $pending: true })

  // a pull while the op is pending must not wipe the optimistic overlay
  serverTodos = [{ id: '1', title: 'Renamed on server', done: false }]
  await store.pull('todos')
  expect(store.snapshot.todos.get('1')).toMatchObject({
    title: 'Renamed on server', // base updated from server
    done: true, //                 pending op still applied on top
    $pending: true
  })
})

test('pulled base state is persisted and hydrates the next session', async () => {
  const storage = memoryStorage()

  const first = createStore({
    name: 'pull-2a',
    storage,
    collections,
    mutators: {},
    pulls: {
      todos: {
        fetch: async () => [{ id: '9', title: 'Cached', done: false }],
        write: (tx, result: Todo[]) => {
          for (const todo of result) tx.todos.set(todo.id, todo)
        }
      }
    }
  })
  stores.push(first)
  await first.ready
  await first.pull('todos')
  await sleep(10)
  first.close()

  const second = createStore({
    name: 'pull-2b',
    storage,
    collections,
    mutators: {}
  })
  stores.push(second)
  await second.ready

  // instantly available offline, before any network call
  expect(second.snapshot.todos.get('9')).toMatchObject({ title: 'Cached' })
})

test('a version bump clears persisted base state but keeps the outbox', async () => {
  const storage = memoryStorage()

  const first = createStore({
    name: 'pull-3a',
    version: 1,
    storage,
    collections,
    mutators: {
      addTodo (tx: AppTx, input: Todo) { tx.todos.set(input.id, input) }
    },
    push: { addTodo: () => {} },
    pulls: {
      todos: {
        fetch: async () => [{ id: 'old', title: 'Old-schema row', done: false }],
        write: (tx, result: Todo[]) => {
          for (const todo of result) tx.todos.set(todo.id, todo)
        }
      }
    }
  })
  stores.push(first)
  await first.ready
  await first.pull('todos')

  first.setOnline(false)
  first.mutate.addTodo({ id: 'queued', title: 'Still wanted', done: false })
  await sleep(20)
  first.close()

  const pushed: Todo[] = []
  const second = createStore({
    name: 'pull-3b',
    version: 2,
    storage,
    collections,
    mutators: {
      addTodo (tx: AppTx, input: Todo) { tx.todos.set(input.id, input) }
    },
    push: { addTodo: ({ input }) => { pushed.push(input) } }
  })
  stores.push(second)
  await second.ready
  await second.flush()

  // old base rows are gone, but the queued op survived and was pushed
  expect(second.snapshot.todos.get('old')).toBeUndefined()
  expect(pushed.map(t => t.id)).toEqual(['queued'])
  expect(second.snapshot.todos.get('queued')).toMatchObject({ title: 'Still wanted' })
})
