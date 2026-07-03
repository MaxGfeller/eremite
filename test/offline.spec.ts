import { afterEach, expect, test } from 'vitest'
import { collection, createStore, memoryStorage } from '../src'
import type { Store, StorageAdapter, Tx } from '../src'
import { sleep, waitUntil } from './utils'

interface Note { id: string, text: string }

const collections = { notes: collection<Note>() }
type AppTx = Tx<typeof collections>

let stores: Array<Store<any, any>> = []
afterEach(() => {
  for (const store of stores) store.close()
  stores = []
})

function makeStore (name: string, storage: StorageAdapter = memoryStorage()) {
  const pushed: Note[] = []

  const store = createStore({
    name,
    storage,
    collections,
    mutators: {
      addNote (tx: AppTx, input: Note) {
        tx.notes.set(input.id, input)
      }
    },
    push: {
      addNote: ({ input }) => { pushed.push(input) }
    }
  })

  stores.push(store)
  return { store, pushed, storage }
}

test('offline mutations queue up and drain in order on reconnect', async () => {
  const { store, pushed } = makeStore('offline-1')
  await store.ready

  store.setOnline(false)

  const handles = [
    store.mutate.addNote({ id: 'a', text: 'first' }),
    store.mutate.addNote({ id: 'b', text: 'second' }),
    store.mutate.addNote({ id: 'c', text: 'third' })
  ]

  expect(store.status.pendingOps).toBe(3)
  expect(pushed).toHaveLength(0)
  // optimistically visible while offline
  expect(store.snapshot.notes.size).toBe(3)
  expect(store.snapshot.notes.get('b')).toMatchObject({ text: 'second', $pending: true })

  store.setOnline(true)
  const outcomes = await Promise.all(handles.map(async h => await h.done))

  expect(outcomes.every(o => o.status === 'committed')).toBe(true)
  expect(pushed.map(n => n.id)).toEqual(['a', 'b', 'c'])
  expect(store.status.pendingOps).toBe(0)
  expect(store.snapshot.notes.get('b')?.$pending).toBeUndefined()
})

test('the outbox survives a reload: a new store picks up and pushes persisted ops', async () => {
  const storage = memoryStorage()
  const first = makeStore('offline-2a', storage)
  await first.store.ready

  first.store.setOnline(false)
  first.store.mutate.addNote({ id: 'x', text: 'queued before reload' })
  first.store.mutate.addNote({ id: 'y', text: 'also queued' })
  expect(first.store.status.pendingOps).toBe(2)
  // let the async outbox write settle before "closing the tab"
  await sleep(20)
  first.store.close()

  // "reload": fresh store instance over the same storage
  const second = makeStore('offline-2b', storage)
  await second.store.ready
  await waitUntil(() => second.store.status.pendingOps === 0)

  expect(second.pushed.map(n => n.id)).toEqual(['x', 'y'])
  expect(second.store.snapshot.notes.get('x')).toMatchObject({ text: 'queued before reload' })
  expect(second.store.snapshot.notes.get('x')?.$pending).toBeUndefined()
})

test('flush resolves when the queue is drained', async () => {
  const { store, pushed } = makeStore('offline-3')
  await store.ready

  store.setOnline(false)
  store.mutate.addNote({ id: 'f', text: 'flush me' })
  store.setOnline(true)

  await store.flush()
  expect(pushed).toHaveLength(1)
  expect(store.status.pendingOps).toBe(0)
})
