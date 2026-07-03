import { afterEach, expect, test } from 'vitest'
import { collection, createStore, isRef, memoryStorage } from '../src'
import type { MutatorCtx, Store, StorageAdapter, Tx } from '../src'
import { httpError, sleep, waitUntil } from './utils'

interface Doc { id: string, title: string, revision: number }

const collections = { docs: collection<Doc>() }
type AppTx = Tx<typeof collections>

let stores: Array<Store<any, any>> = []
afterEach(() => {
  for (const store of stores) store.close()
  stores = []
})

test('mutations enqueued before hydration finishes are pushed after it', async () => {
  const storage = memoryStorage()
  await storage.set('b:docs:pre', { id: 'pre', title: 'Hydrated row', revision: 1 })

  const pushed: Doc[] = []
  const store = createStore({
    name: 'advanced-1',
    storage,
    collections,
    mutators: {
      addDoc (tx: AppTx, input: Doc) { tx.docs.set(input.id, input) }
    },
    push: { addDoc: ({ input }) => { pushed.push(input) } }
  })
  stores.push(store)

  // enqueue immediately, without awaiting ready
  const handle = store.mutate.addDoc({ id: 'early', title: 'Before hydration', revision: 0 })
  expect(store.snapshot.docs.get('early')).toBeDefined()

  const outcome = await handle.done
  expect(outcome).toEqual({ status: 'committed' })
  expect(pushed.map(d => d.id)).toEqual(['early'])

  // hydrated base row and early mutation coexist
  await store.ready
  expect(store.snapshot.docs.get('pre')).toMatchObject({ title: 'Hydrated row' })
  expect(store.snapshot.docs.get('early')).toMatchObject({ title: 'Before hydration' })
})

test('the idempotency key is stable across retries', async () => {
  const seenKeys: string[] = []
  let failures = 2

  const store = createStore({
    name: 'advanced-2',
    storage: memoryStorage(),
    collections,
    retry: { maxAttempts: 5, baseDelayMs: 5, maxDelayMs: 10 },
    mutators: {
      addDoc (tx: AppTx, input: Doc) { tx.docs.set(input.id, input) }
    },
    push: {
      addDoc: ({ idempotencyKey }) => {
        seenKeys.push(idempotencyKey)
        if (failures-- > 0) throw httpError(503)
      }
    }
  })
  stores.push(store)
  await store.ready

  const handle = store.mutate.addDoc({ id: 'd', title: 'Retry me', revision: 0 })
  const outcome = await handle.done

  expect(outcome).toEqual({ status: 'committed' })
  expect(seenKeys).toHaveLength(3)
  expect(new Set(seenKeys).size).toBe(1)
  expect(seenKeys[0]).toBe(handle.opId)
})

test('editing an entity created by a pending op follows the ref through commit', async () => {
  const pushedRenames: Array<{ id: string | number, title: string }> = []

  const store = createStore({
    name: 'advanced-3',
    storage: memoryStorage(),
    collections,
    mutators: {
      createDoc (tx: AppTx, input: { title: string }, ctx: MutatorCtx) {
        const id = ctx.ref('doc')
        tx.docs.set(id, { id, title: input.title, revision: 0 })
        return { id }
      },
      renameDoc (tx: AppTx, input: { id: string, title: string }) {
        tx.docs.update(input.id, d => {
          d.title = input.title
          d.revision++
        })
      }
    },
    push: {
      createDoc: ({ resolve }) => { resolve('doc', 'srv-1') },
      renameDoc: ({ input }) => { pushedRenames.push(input) }
    }
  })
  stores.push(store)
  await store.ready

  store.setOnline(false)
  const created = store.mutate.createDoc({ title: 'Draft' })
  const refId = created.result.id
  const renamed = store.mutate.renameDoc({ id: refId, title: 'Final title' })

  // while offline, the edit applies to the ref-keyed optimistic entity
  expect(store.snapshot.docs.get(refId)).toMatchObject({ title: 'Final title', revision: 1 })

  store.setOnline(true)
  await created.done
  await renamed.done

  // the rename hit the server with the real ID, and base state is re-keyed
  expect(pushedRenames[0]?.id).toBe('srv-1')
  expect(store.snapshot.docs.get(refId)).toBeUndefined()
  expect(store.snapshot.docs.get('srv-1')).toMatchObject({ title: 'Final title', revision: 1 })
})

test('conflicts survive a reload', async () => {
  const storage = memoryStorage()

  const first = createStore({
    name: 'advanced-4a',
    storage,
    collections,
    retry: { maxAttempts: 1 },
    mutators: {
      addDoc (tx: AppTx, input: Doc) { tx.docs.set(input.id, input) }
    },
    push: { addDoc: () => { throw httpError(422, 'no thanks') } }
  })
  stores.push(first)
  await first.ready

  await first.mutate.addDoc({ id: 'c', title: 'Conflicted', revision: 0 }).done
  expect(first.conflicts).toHaveLength(1)
  await sleep(20)
  first.close()

  const second = createStore({
    name: 'advanced-4b',
    storage,
    collections,
    mutators: {
      addDoc (tx: AppTx, input: Doc) { tx.docs.set(input.id, input) }
    },
    push: { addDoc: () => {} }
  })
  stores.push(second)
  await second.ready

  expect(second.conflicts).toHaveLength(1)
  expect(second.conflicts[0]).toMatchObject({ reason: 'rejected', message: 'no thanks' })

  // ...and are retryable in the new session
  second.retryConflict(second.conflicts[0].op.id)
  await waitUntil(() => second.status.pendingOps === 0 && second.conflicts.length === 0)
  expect(second.snapshot.docs.get('c')).toMatchObject({ title: 'Conflicted' })
})

test('retrying a dependent without its failed producer drops it as unresolved-reference', async () => {
  const store = createStore({
    name: 'advanced-5',
    storage: memoryStorage(),
    collections,
    retry: { maxAttempts: 1 },
    mutators: {
      createDoc (tx: AppTx, input: { title: string }, ctx: MutatorCtx) {
        const id = ctx.ref('doc')
        tx.docs.set(id, { id, title: input.title, revision: 0 })
        return { id }
      },
      renameDoc (tx: AppTx, input: { id: string, title: string }) {
        tx.docs.update(input.id, d => { d.title = input.title })
      }
    },
    push: {
      createDoc: () => { throw httpError(422) },
      renameDoc: () => {}
    }
  })
  stores.push(store)
  await store.ready

  store.setOnline(false)
  const created = store.mutate.createDoc({ title: 'Doomed' })
  store.mutate.renameDoc({ id: created.result.id, title: 'Never' })
  store.setOnline(true)

  await waitUntil(() => store.conflicts.length === 2)

  // discard the producer, retry only the dependent: its ref can never resolve
  const producer = store.conflicts.find(c => c.op.mutator === 'createDoc')!
  const dependent = store.conflicts.find(c => c.op.mutator === 'renameDoc')!
  store.discardConflict(producer.op.id)
  store.retryConflict(dependent.op.id)

  await waitUntil(() => store.status.pendingOps === 0)
  expect(store.conflicts).toHaveLength(1)
  expect(store.conflicts[0]).toMatchObject({ reason: 'unresolved-reference' })
})

test('optimistic deletes roll through commit and remove the persisted row', async () => {
  const storage = memoryStorage()
  const store = createStore({
    name: 'advanced-6',
    storage,
    collections,
    mutators: {
      addDoc (tx: AppTx, input: Doc) { tx.docs.set(input.id, input) },
      deleteDoc (tx: AppTx, input: { id: string }) { tx.docs.delete(input.id) }
    },
    push: { addDoc: () => {}, deleteDoc: () => {} }
  })
  stores.push(store)
  await store.ready

  await store.mutate.addDoc({ id: 'gone', title: 'Ephemeral', revision: 0 }).done
  expect(await storage.get('b:docs:gone')).toBeDefined()

  store.setOnline(false)
  const handle = store.mutate.deleteDoc({ id: 'gone' })
  expect(store.snapshot.docs.get('gone')).toBeUndefined()

  store.setOnline(true)
  await handle.done
  expect(store.snapshot.docs.get('gone')).toBeUndefined()
  expect(await storage.get('b:docs:gone')).toBeUndefined()
})

test('non-cloneable input is rejected up front', async () => {
  const store = createStore({
    name: 'advanced-7',
    storage: memoryStorage(),
    collections,
    mutators: {
      addDoc (_tx: AppTx, _input: unknown) {}
    }
  })
  stores.push(store)
  await store.ready

  expect(() => store.mutate.addDoc({ callback: () => {} })).toThrow(/structured-cloneable/)
  expect(store.status.pendingOps).toBe(0)
})

test('pendingOps exposes defensive copies of the outbox', async () => {
  const store = createStore({
    name: 'advanced-8',
    storage: memoryStorage(),
    collections,
    mutators: {
      addDoc (tx: AppTx, input: Doc) { tx.docs.set(input.id, input) }
    },
    push: { addDoc: () => {} }
  })
  stores.push(store)
  await store.ready

  store.setOnline(false)
  store.mutate.addDoc({ id: 'q', title: 'Queued', revision: 0 })

  const ops = store.pendingOps
  expect(ops).toHaveLength(1)
  expect(ops[0]).toMatchObject({ mutator: 'addDoc', attempts: 0 })
  expect(isRef(ops[0].id)).toBe(false)

  // mutating the copy has no effect on the real outbox
  ops[0].mutator = 'hacked'
  expect(store.pendingOps[0].mutator).toBe('addDoc')
})

test('two stores over the same storage: ops enqueued by one are adopted and pushed by the other', async () => {
  const storage = memoryStorage()
  const pushed: string[] = []

  function make (name: string, storageAdapter: StorageAdapter) {
    const store = createStore({
      name,
      storage: storageAdapter,
      collections,
      mutators: {
        addDoc (tx: AppTx, input: Doc) { tx.docs.set(input.id, input) }
      },
      push: { addDoc: ({ input }) => { pushed.push(input.id) } }
    })
    stores.push(store)
    return store
  }

  // "tab one" queues while offline, then closes without pushing
  const writer = make('advanced-9a', storage)
  await writer.ready
  writer.setOnline(false)
  writer.mutate.addDoc({ id: 'shared', title: 'Cross-instance', revision: 0 })
  await sleep(20)
  writer.close()

  // "tab two" adopts the persisted op during hydration and pushes it
  const reader = make('advanced-9b', storage)
  await reader.ready
  await waitUntil(() => reader.status.pendingOps === 0)
  expect(pushed).toEqual(['shared'])
  expect(reader.snapshot.docs.get('shared')).toMatchObject({ title: 'Cross-instance' })
})
