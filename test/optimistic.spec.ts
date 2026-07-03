import { afterEach, expect, test } from 'vitest'
import { collection, createStore, memoryStorage } from '../src'
import type { Store, StorageAdapter, Tx } from '../src'

interface Project { id: string, name: string, todoCount: number }
interface Todo { id: string, projectId: string, title: string, done: boolean }

const collections = {
  projects: collection<Project>(),
  todos: collection<Todo>()
}
type AppTx = Tx<typeof collections>

let stores: Array<Store<any, any>> = []
afterEach(() => {
  for (const store of stores) store.close()
  stores = []
})

function makeStore (name: string, storage: StorageAdapter = memoryStorage()) {
  const pushed: Array<{ mutator: string, input: unknown, idempotencyKey: string }> = []

  const store = createStore({
    name,
    storage,
    collections,
    mutators: {
      createProject (tx: AppTx, input: Project) {
        tx.projects.set(input.id, input)
        return input.id
      },
      createTodo (tx: AppTx, input: Todo) {
        tx.todos.set(input.id, input)
        tx.projects.update(input.projectId, p => { p.todoCount++ })
      },
      toggleTodo (tx: AppTx, input: { id: string }) {
        tx.todos.update(input.id, t => { t.done = !t.done })
      },
      // local-only: no push handler
      renameProjectLocally (tx: AppTx, input: { id: string, name: string }) {
        tx.projects.update(input.id, p => { p.name = input.name })
      }
    },
    push: {
      createProject: ({ input, idempotencyKey }) => {
        pushed.push({ mutator: 'createProject', input, idempotencyKey })
      },
      createTodo: ({ input, idempotencyKey }) => {
        pushed.push({ mutator: 'createTodo', input, idempotencyKey })
      },
      toggleTodo: ({ input, idempotencyKey }) => {
        pushed.push({ mutator: 'toggleTodo', input, idempotencyKey })
      }
    }
  })

  stores.push(store)
  return { store, pushed, storage }
}

test('mutations apply optimistically, commit after push, and clear $pending', async () => {
  const { store, pushed } = makeStore('optimistic-1')
  await store.ready

  const id = store.id()
  const handle = store.mutate.createProject({ id, name: 'Relaunch', todoCount: 0 })

  // synchronous optimistic visibility, flagged as pending
  expect(handle.result).toBe(id)
  const optimistic = store.snapshot.projects.get(id)
  expect(optimistic).toMatchObject({ name: 'Relaunch', $pending: true })
  expect(store.status.pendingOps).toBe(1)

  const outcome = await handle.done
  expect(outcome).toEqual({ status: 'committed' })

  const committed = store.snapshot.projects.get(id)
  expect(committed).toMatchObject({ name: 'Relaunch' })
  expect(committed?.$pending).toBeUndefined()
  expect(store.status.pendingOps).toBe(0)

  expect(pushed).toHaveLength(1)
  expect(pushed[0].mutator).toBe('createProject')
  expect(pushed[0].idempotencyKey).toBe(handle.opId)
})

test('cross-collection effects are plain writes in the same mutator', async () => {
  const { store } = makeStore('optimistic-2')
  await store.ready

  const projectId = store.id()
  await store.mutate.createProject({ id: projectId, name: 'P', todoCount: 0 }).done
  const handle = store.mutate.createTodo({ id: store.id(), projectId, title: 'T', done: false })

  // both collections update in the same optimistic snapshot
  expect(store.snapshot.projects.get(projectId)?.todoCount).toBe(1)
  await handle.done
  expect(store.snapshot.projects.get(projectId)?.todoCount).toBe(1)
  expect(store.snapshot.todos.size).toBe(1)
})

test('local-only mutators (no push handler) commit without a network call', async () => {
  const { store, pushed } = makeStore('optimistic-3')
  await store.ready

  const id = store.id()
  await store.mutate.createProject({ id, name: 'Old', todoCount: 0 }).done
  const outcome = await store.mutate.renameProjectLocally({ id, name: 'New' }).done

  expect(outcome).toEqual({ status: 'committed' })
  expect(store.snapshot.projects.get(id)?.name).toBe('New')
  expect(pushed.filter(p => p.mutator === 'renameProjectLocally')).toHaveLength(0)
})

test('committed base state is persisted per record', async () => {
  const { store, storage } = makeStore('optimistic-4')
  await store.ready

  const id = store.id()
  await store.mutate.createProject({ id, name: 'Persisted', todoCount: 0 }).done

  const row = await storage.get(`b:projects:${id}`)
  expect(row).toMatchObject({ name: 'Persisted' })
})

test('a throwing mutator rejects synchronously and leaves no trace', async () => {
  const storage = memoryStorage()
  const store = createStore({
    name: 'optimistic-5',
    storage,
    collections,
    mutators: {
      boom (_tx: AppTx, _input: null) {
        throw new Error('mutator exploded')
      }
    }
  })
  stores.push(store)
  await store.ready

  expect(() => store.mutate.boom(null)).toThrow('mutator exploded')
  expect(store.status.pendingOps).toBe(0)
  expect(store.conflicts).toHaveLength(0)
})

test('subscribe fires on every visible change', async () => {
  const { store } = makeStore('optimistic-6')
  await store.ready

  let notifications = 0
  const unsubscribe = store.subscribe(() => { notifications++ })

  const handle = store.mutate.createProject({ id: store.id(), name: 'N', todoCount: 0 })
  expect(notifications).toBeGreaterThan(0)
  await handle.done

  const afterCommit = notifications
  unsubscribe()
  store.mutate.createProject({ id: store.id(), name: 'M', todoCount: 0 })
  expect(notifications).toBe(afterCommit)
})
