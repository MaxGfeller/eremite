import { afterEach, expect, test } from 'vitest'
import { collection, createStore, memoryStorage } from '../src'
import type { MutatorCtx, Store, Tx } from '../src'
import { httpError, networkError, sleep, waitUntil } from './utils'

interface Invoice { id: string, customer: string }
interface LineItem { id: string, invoiceId: string | number, text: string }

const collections = {
  invoices: collection<Invoice>(),
  lineItems: collection<LineItem>()
}
type AppTx = Tx<typeof collections>

let stores: Array<Store<any, any>> = []
afterEach(() => {
  for (const store of stores) store.close()
  stores = []
})

test('a rejected op is dropped and its dependents cascade into conflicts', async () => {
  let rejectInvoices = true
  const pushedItems: LineItem[] = []

  const store = createStore({
    name: 'conflicts-1',
    storage: memoryStorage(),
    collections,
    retry: { maxAttempts: 3, baseDelayMs: 5 },
    mutators: {
      createInvoice (tx: AppTx, input: { customer: string }, ctx: MutatorCtx) {
        const id = ctx.ref('invoice')
        tx.invoices.set(id, { id, customer: input.customer })
        return { id }
      },
      addLineItem (tx: AppTx, input: LineItem) {
        tx.lineItems.set(input.id, input)
      }
    },
    push: {
      createInvoice: ({ resolve }) => {
        if (rejectInvoices) throw httpError(422, 'validation failed')
        resolve('invoice', 99)
      },
      addLineItem: ({ input }) => { pushedItems.push(input) }
    }
  })
  stores.push(store)
  await store.ready

  store.setOnline(false)
  const invoice = store.mutate.createInvoice({ customer: 'Doomed Inc' })
  const item = store.mutate.addLineItem({ id: 'li-1', invoiceId: invoice.result.id, text: 'Item' })
  store.setOnline(true)

  const invoiceOutcome = await invoice.done
  const itemOutcome = await item.done

  expect(invoiceOutcome).toMatchObject({ status: 'dropped', reason: 'rejected' })
  expect(itemOutcome).toMatchObject({ status: 'dropped', reason: 'dependency-failed' })

  // one coherent conflict group, optimistic effects rolled back
  expect(store.conflicts.map(c => c.reason)).toEqual(['rejected', 'dependency-failed'])
  expect(store.snapshot.invoices.size).toBe(0)
  expect(store.snapshot.lineItems.size).toBe(0)
  expect(store.status.pendingOps).toBe(0)

  // retrying the producer first, then the dependent, replays the whole chain
  rejectInvoices = false
  const [producer, dependent] = store.conflicts.map(c => c.op.id)
  store.retryConflict(producer)
  store.retryConflict(dependent)

  await waitUntil(() => store.status.pendingOps === 0 && store.conflicts.length === 0)
  expect(pushedItems[0]?.invoiceId).toBe(99)
  expect(store.snapshot.invoices.get('99')).toMatchObject({ customer: 'Doomed Inc' })
})

test('discarding a conflict removes it for good', async () => {
  const store = createStore({
    name: 'conflicts-2',
    storage: memoryStorage(),
    collections,
    retry: { maxAttempts: 1, baseDelayMs: 5 },
    mutators: {
      addLineItem (tx: AppTx, input: LineItem) { tx.lineItems.set(input.id, input) }
    },
    push: {
      addLineItem: () => { throw httpError(403, 'forbidden') }
    }
  })
  stores.push(store)
  await store.ready

  const handle = store.mutate.addLineItem({ id: 'li', invoiceId: 1, text: 'x' })
  await handle.done
  expect(store.conflicts).toHaveLength(1)

  store.discardConflict(store.conflicts[0].op.id)
  expect(store.conflicts).toHaveLength(0)
})

test('retryable errors back off and become a conflict after maxAttempts', async () => {
  let attempts = 0

  const store = createStore({
    name: 'conflicts-3',
    storage: memoryStorage(),
    collections,
    retry: { maxAttempts: 3, baseDelayMs: 5, maxDelayMs: 10 },
    mutators: {
      addLineItem (tx: AppTx, input: LineItem) { tx.lineItems.set(input.id, input) }
    },
    push: {
      addLineItem: () => {
        attempts++
        throw httpError(500, 'server exploded')
      }
    }
  })
  stores.push(store)
  await store.ready

  const outcome = await store.mutate.addLineItem({ id: 'li', invoiceId: 1, text: 'x' }).done

  expect(attempts).toBe(3)
  expect(outcome).toMatchObject({ status: 'dropped', reason: 'push-failed' })
  expect(store.conflicts[0]?.message).toBe('server exploded')
})

test('network errors pause the queue instead of consuming attempts', async () => {
  let failNetwork = true
  let attempts = 0

  const store = createStore({
    name: 'conflicts-4',
    storage: memoryStorage(),
    collections,
    retry: { baseDelayMs: 60000 },
    mutators: {
      addLineItem (tx: AppTx, input: LineItem) { tx.lineItems.set(input.id, input) }
    },
    push: {
      addLineItem: () => {
        attempts++
        if (failNetwork) throw networkError()
      }
    }
  })
  stores.push(store)
  await store.ready

  const handle = store.mutate.addLineItem({ id: 'li', invoiceId: 1, text: 'x' })
  await waitUntil(() => !store.status.online)

  // still pending, not a conflict — the op is just waiting for connectivity
  expect(store.status.pendingOps).toBe(1)
  expect(store.conflicts).toHaveLength(0)
  expect(store.snapshot.lineItems.get('li')).toMatchObject({ $pending: true })

  failNetwork = false
  store.setOnline(true)
  await handle.done

  expect(attempts).toBe(2)
  expect(store.snapshot.lineItems.get('li')?.$pending).toBeUndefined()
})

test('probes stay reported as offline until a push succeeds, then auto-recover', async () => {
  let failNetwork = true
  const onlineHistory: boolean[] = []

  const store = createStore({
    name: 'conflicts-probe',
    storage: memoryStorage(),
    collections,
    retry: { baseDelayMs: 10, maxDelayMs: 20 },
    mutators: {
      addLineItem (tx: AppTx, input: LineItem) { tx.lineItems.set(input.id, input) }
    },
    push: {
      addLineItem: () => {
        if (failNetwork) throw networkError()
      }
    }
  })
  stores.push(store)
  store.subscribe(() => onlineHistory.push(store.status.online))
  await store.ready

  const handle = store.mutate.addLineItem({ id: 'li', invoiceId: 1, text: 'x' })
  await waitUntil(() => !store.status.online)

  // several probe cycles run while the server is still down: the reported
  // status must never flip back to online in between
  await sleep(100)
  expect(store.status.online).toBe(false)
  expect(onlineHistory.slice(onlineHistory.indexOf(false)).includes(true)).toBe(false)

  // heal the server: the next probe pushes successfully and the status
  // recovers on its own, without setOnline()
  failNetwork = false
  const outcome = await handle.done
  expect(outcome).toEqual({ status: 'committed' })
  await waitUntil(() => store.status.online)
})

test('a custom onPushError policy overrides the default classification', async () => {
  const store = createStore({
    name: 'conflicts-5',
    storage: memoryStorage(),
    collections,
    retry: { maxAttempts: 5, baseDelayMs: 5 },
    onPushError: () => 'drop',
    mutators: {
      addLineItem (tx: AppTx, input: LineItem) { tx.lineItems.set(input.id, input) }
    },
    push: {
      // would be retryable by default policy
      addLineItem: () => { throw httpError(500) }
    }
  })
  stores.push(store)
  await store.ready

  const outcome = await store.mutate.addLineItem({ id: 'li', invoiceId: 1, text: 'x' }).done
  expect(outcome).toMatchObject({ status: 'dropped', reason: 'rejected' })
})
