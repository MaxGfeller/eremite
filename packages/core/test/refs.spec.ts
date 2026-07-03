import { afterEach, expect, test } from 'vitest'
import { collection, createStore, isRef, memoryStorage } from '../src'
import type { MutatorCtx, Store, StorageAdapter, Tx } from '../src'
import { networkError, sleep, waitUntil } from './utils'

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

interface ServerBehavior {
  nextInvoiceId: number
  failLineItemsWithNetworkError: boolean
}

function makeStore (name: string, storage: StorageAdapter, server: ServerBehavior) {
  const pushedInvoices: Invoice[] = []
  const pushedItems: LineItem[] = []

  const store = createStore({
    name,
    storage,
    collections,
    retry: { baseDelayMs: 60000 },
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
      createInvoice: ({ input, resolve }) => {
        pushedInvoices.push(input as Invoice)
        resolve('invoice', server.nextInvoiceId)
      },
      addLineItem: ({ input }) => {
        if (server.failLineItemsWithNetworkError) throw networkError()
        pushedItems.push(input)
      }
    }
  })

  stores.push(store)
  return { store, pushedInvoices, pushedItems }
}

test('server-assigned IDs: refs auto-order dependent ops and are substituted on push', async () => {
  const server: ServerBehavior = { nextInvoiceId: 42, failLineItemsWithNetworkError: false }
  const { store, pushedItems } = makeStore('refs-1', memoryStorage(), server)
  await store.ready

  store.setOnline(false)

  const invoice = store.mutate.createInvoice({ customer: 'ACME' })
  const refId = invoice.result.id
  expect(isRef(refId)).toBe(true)

  // relation to a not-yet-created entity, expressed naturally
  const item = store.mutate.addLineItem({ id: store.id(), invoiceId: refId, text: 'Consulting' })

  // optimistic state is keyed by the ref while unresolved
  expect(store.snapshot.invoices.get(refId)).toMatchObject({ customer: 'ACME', $pending: true })
  expect(store.snapshot.lineItems.all()[0]?.invoiceId).toBe(refId)

  store.setOnline(true)
  await invoice.done
  await item.done

  // the push handler saw the real ID, not the ref
  expect(pushedItems[0]?.invoiceId).toBe(42)

  // committed state is keyed by the real ID; the ref key is gone
  expect(store.snapshot.invoices.get(refId)).toBeUndefined()
  expect(store.snapshot.invoices.get('42')).toMatchObject({ id: '42', customer: 'ACME' })
  expect(store.snapshot.lineItems.all()[0]?.invoiceId).toBe(42)
})

test('a ref chain survives a reload mid-chain (ID map is persisted)', async () => {
  const storage = memoryStorage()
  const server: ServerBehavior = { nextInvoiceId: 7, failLineItemsWithNetworkError: true }

  const first = makeStore('refs-2a', storage, server)
  await first.store.ready

  const invoice = first.store.mutate.createInvoice({ customer: 'Offline Corp' })
  first.store.mutate.addLineItem({ id: 'li-1', invoiceId: invoice.result.id, text: 'Support' })

  // invoice pushes fine and resolves the ref; the line item hits a network
  // error, which flips the store offline mid-chain
  await invoice.done
  await waitUntil(() => !first.store.status.online)
  expect(first.store.status.pendingOps).toBe(1)
  await sleep(20)
  first.store.close()

  // reload into a healthy network
  server.failLineItemsWithNetworkError = false
  const second = makeStore('refs-2b', storage, server)
  await second.store.ready
  await waitUntil(() => second.store.status.pendingOps === 0)

  // the reloaded store resolved the persisted ref to the real ID
  expect(second.pushedItems[0]?.invoiceId).toBe(7)
  expect(second.store.snapshot.lineItems.get('li-1')?.invoiceId).toBe(7)
  expect(second.store.snapshot.invoices.get('7')).toMatchObject({ customer: 'Offline Corp' })
})

test('client-generated IDs need no refs at all', async () => {
  const server: ServerBehavior = { nextInvoiceId: 0, failLineItemsWithNetworkError: false }
  const storage = memoryStorage()
  const pushedTodos: Array<{ id: string, listId: string }> = []

  const store = createStore({
    name: 'refs-3',
    storage,
    collections: {
      lists: collection<{ id: string, name: string }>(),
      todos: collection<{ id: string, listId: string }>()
    },
    mutators: {
      createList (tx, input: { id: string, name: string }) {
        tx.lists.set(input.id, input)
      },
      createTodo (tx, input: { id: string, listId: string }) {
        tx.todos.set(input.id, input)
      }
    },
    push: {
      createList: () => {},
      createTodo: ({ input }) => { pushedTodos.push(input) }
    }
  })
  stores.push(store)
  await store.ready
  void server

  store.setOnline(false)
  const listId = store.id()
  const a = store.mutate.createList({ id: listId, name: 'Groceries' })
  const b = store.mutate.createTodo({ id: store.id(), listId })
  store.setOnline(true)

  await a.done
  await b.done
  expect(pushedTodos[0]?.listId).toBe(listId)
  expect(store.snapshot.todos.all()[0]?.listId).toBe(listId)
})
