# Eremite.js

**An offline-first data layer for apps that talk to any REST backend.**

Eremite gives your app a local, optimistic view of server data that keeps working without a connection. Writes go into a persistent outbox and are pushed to your API when connectivity allows — in order, exactly once, surviving page reloads. Unlike sync engines (Replicache/Zero, PowerSync, ElectricSQL, …), Eremite requires **nothing special on the server**: if you can call it with `fetch`, you can go offline-first with it.

- **Zero runtime dependencies.** IndexedDB, Web Locks, BroadcastChannel, `crypto` — the platform provides everything now.
- **Framework-agnostic core** with a Vue 3 adapter (`@eremitejs/vue`). React and others are a thin `subscribe` bridge away.
- **First-class handling of IDs and relations** — including backends that insist on assigning IDs themselves.

```bash
npm install @eremitejs/core
# framework bindings:
npm install @eremitejs/vue    # or
npm install @eremitejs/react
```

## The model in one paragraph

Your data lives in **collections** (typed maps of entities). Server-confirmed data is **base state**; base state is never touched optimistically. Every write is a named **mutator**: a pure, synchronous function that edits a transactional draft over *all* collections. Calling `store.mutate.createTodo(input)` appends an **op** (mutator name + input) to a persistent outbox and rebases: the visible snapshot is always *base state + pending ops replayed in order*. A **push handler** performs the network call for each op; on success the mutation is committed into base state, on failure it is retried, or rolled back and surfaced as a **conflict**. Because the visible state is derived, rollback and reordering are trivial — nothing is ever patched in place.

## Quick start

```ts
import { collection, createStore } from '@eremitejs/core'

interface Project { id: string; name: string; todoCount: number }
interface Todo { id: string; projectId: string; title: string; done: boolean }

export const store = createStore({
  name: 'app',
  version: 1,
  collections: {
    projects: collection<Project>(),
    todos: collection<Todo>()
  },

  // Pure, synchronous, replayable. A mutator can touch every collection.
  mutators: {
    createTodo (tx, input: Todo) {
      tx.todos.set(input.id, input)
      tx.projects.update(input.projectId, p => { p.todoCount++ })
    },
    toggleTodo (tx, input: { id: string }) {
      tx.todos.update(input.id, t => { t.done = !t.done })
    }
  },

  // The network effect per mutator. Runs from the outbox with retries and
  // backoff. Send the idempotency key so server-side dedup makes retries safe.
  push: {
    async createTodo ({ input, idempotencyKey }) {
      await api.post('/todos', input, { headers: { 'Idempotency-Key': idempotencyKey } })
    },
    async toggleTodo ({ input }) {
      await api.patch(`/todos/${input.id}`, { done: input.done })
    }
  },

  // Reads: fetched from the server, written into base state, cached locally.
  pulls: {
    todos: {
      fetch: async (args: { projectId: string }) => await api.get(`/projects/${args.projectId}/todos`),
      write (tx, todos: Todo[]) {
        for (const todo of todos) tx.todos.set(todo.id, todo)
      }
    }
  }
})
```

Using it:

```ts
await store.ready                      // persisted state hydrated

const id = store.id()                  // client-generated UUIDv7 — this IS the real ID
const { done } = store.mutate.createTodo({ id, projectId, title: 'Ship it', done: false })

store.snapshot.todos.get(id)           // ← visible immediately, marked { $pending: true }
await done                             // { status: 'committed' } once the server accepted it
```

If the user is offline, nothing changes in your code: the op waits in IndexedDB (across reloads), the UI shows the optimistic entity, and the push happens after reconnect.

## IDs and relations

### The happy path: client-generated IDs

`store.id()` returns a UUIDv7 — time-ordered, globally unique, valid as a permanent primary key. If your backend accepts client-supplied IDs, **the temporary-ID problem does not exist**: relations reference the final ID from the first millisecond, offline or not.

```ts
const projectId = store.id()
store.mutate.createProject({ id: projectId, name: 'Relaunch', todoCount: 0 })
store.mutate.createTodo({ id: store.id(), projectId, title: 'First task', done: false })
```

### Server-assigned IDs: refs

Most existing backends mint their own IDs. For those, a mutator can declare a **ref** — a stable placeholder that the push handler later resolves to the real ID:

```ts
mutators: {
  createInvoice (tx, input: { customer: string }, ctx) {
    const id = ctx.ref('invoice')          // minted once, at enqueue time
    tx.invoices.set(id, { id, customer: input.customer })
    return { id }
  },
  addLineItem (tx, input: { id: string; invoiceId: string; text: string }) {
    tx.lineItems.set(input.id, input)
  }
},
push: {
  async createInvoice ({ input, resolve, idempotencyKey }) {
    const created = await api.post('/invoices', input, { idempotencyKey })
    resolve('invoice', created.id)         // persisted; everything downstream is rewritten
  },
  async addLineItem ({ input }) {
    await api.post(`/invoices/${input.invoiceId}/items`, input)   // input.invoiceId is the REAL id here
  }
}
```

```ts
const { result } = store.mutate.createInvoice({ customer: 'ACME' })
store.mutate.addLineItem({ id: store.id(), invoiceId: result.id, text: 'Consulting' })
```

What Eremite guarantees about refs:

- **Automatic ordering.** An op whose input contains an unresolved ref implicitly waits for the op that produces it — no manual dependency wiring.
- **Deep substitution.** Once resolved, the real ID replaces the ref everywhere in later ops' inputs (nested values *and* object keys) before their push handlers run.
- **Persistence.** Refs and the ref→ID map survive reloads; a chain interrupted halfway continues correctly in the next session.
- **Grouped failure.** If the producing op is rejected, every dependent op is dropped with it and surfaced as one coherent group of conflicts.
- **Self-healing state.** Derived state is recomputed from base + ops, so entities keyed by a ref automatically re-key to the real ID; base state never contains a ref.

The one thing it cannot hide: an entity's key changes from the ref to the real ID at commit. Prefer client-generated IDs wherever the backend allows them.

## Errors, retries and conflicts

Push failures are classified (`onPushError` lets you override):

| Failure | Default behavior |
|---|---|
| Network error (fetch `TypeError`) | Store goes **offline**, op keeps waiting; retries with backoff, no attempt is consumed |
| HTTP 408 / 425 / 429 / 5xx | **Retry** with exponential backoff, up to `retry.maxAttempts` (default 5) |
| Other 4xx | **Drop**: the op's optimistic effect is rolled back and it becomes a *conflict* |

Conflicts are persisted and yours to present:

```ts
store.conflicts                 // [{ op, reason, message, at }]
store.retryConflict(op.id)      // re-enqueue (retry a producer before its dependents)
store.discardConflict(op.id)    // accept the server's verdict
```

`mutate()` returns a handle — `done` resolves (never rejects) with the final outcome:

```ts
const { result, done, opId } = store.mutate.createInvoice({ customer: 'ACME' })
const outcome = await done      // { status: 'committed' } | { status: 'dropped', reason, message }
```

## Reads: pulls

Reads never enter the outbox (queueing a *fetch* for later replay makes no sense — that was one of the original design's mistakes). A pull fetches, then atomically writes into base state; pending ops are rebased on top, so an optimistic edit is never clobbered by a refetch racing it. Pulled data is persisted per record and hydrates instantly on the next launch, giving you stale-while-revalidate for free.

```ts
await store.pull('todos', { projectId })
```

## Vue

```vue
<script setup lang="ts">
import { useQuery, usePull, useSyncStatus } from '@eremitejs/vue'
import { store } from '../store'

const props = defineProps<{ projectId: string }>()

const todos = useQuery(store, s => s.todos.where(t => t.projectId === props.projectId))
const { loading } = usePull(store, 'todos', () => ({ projectId: props.projectId }))
const { online, pendingOps, conflicts } = useSyncStatus(store)
</script>

<template>
  <TodoItem v-for="t in todos" :key="t.id" :todo="t" :pending="t.$pending" />
  <OfflineBanner v-if="!online" :queued="pendingOps" />
  <ConflictList :conflicts="conflicts" />
</template>
```

The core is plain `snapshot` + `subscribe`; a React adapter is ~10 lines of `useSyncExternalStore`.

## Multi-tab

In the browser, tabs elect a single **leader** via the Web Locks API; only the leader drains the outbox, so an action is never pushed twice. Any tab can enqueue (the outbox document is merged under a cross-tab lock), and BroadcastChannel keeps every tab's snapshot and `done` promises in sync. Disable with `multiTab: false`.

## Storage & versioning

Persistence defaults to IndexedDB (`idbStorage`), with per-record rows for base state and single documents for the outbox, ID map and conflicts. Pass `storage: memoryStorage()` in tests, `storage: null` to disable persistence, or implement the four-method `StorageAdapter` interface for anything else.

Bump `version` when your entity shapes change: by default Eremite drops cached base state (it can be refetched) and **keeps the outbox** (it's user data). Provide `onVersionChange` for custom migrations.

## Writing good mutators

1. **Pure and synchronous.** A mutator replays many times (every rebase, plus once at commit). No fetches, no timers, no randomness — IDs come from `store.id()` *outside* or `ctx.ref()` *inside* (which is replay-stable).
2. **Tolerate missing entities.** `tx.update(id, fn)` is a no-op when the entity is absent; replays run against states where a pull may have removed it.
3. **Inputs are data.** They're structured-cloned and persisted — no functions, no class instances.
4. **Cross-collection writes are normal.** The draft spans all collections; a counter update next to an insert is one atomic mutation.

## Status & history

This is a ground-up rewrite (v0.1.x) of a 2021-22 prototype. The core ideas survived — resource-oriented state, a persistent action queue, optimistic mutations replayed over confirmed state — but the implementation replaced decorators with plain config, closures-as-cross-resource-mutations with whole-store mutators, string-sniffed temporary IDs with persisted refs + automatic dependency ordering, localForage blobs with per-record IndexedDB rows, and Vue-coupled internals with a framework-agnostic snapshot/subscribe core. Runnable Vue and React example apps live in [`examples/`](https://github.com/eremitejs/eremite/tree/main/examples).

## License

MIT
