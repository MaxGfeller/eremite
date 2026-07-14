# Eremite.js

**An offline-first data layer for apps that talk to any REST backend.**

[Website](https://www.eremitejs.org) · [Documentation](https://docs.eremitejs.org)

Eremite gives your app a local, optimistic view of your server data that keeps working without a connection. Reads are cached locally and render instantly on the next visit. Writes apply to the UI immediately, go into a persistent outbox, and are pushed to your API when connectivity allows — in order, exactly once, surviving page reloads.

Unlike sync engines, Eremite requires **nothing special on the server**: if you can call your API with `fetch`, you can make your app offline-first. That includes backends that assign their own IDs — Eremite tracks placeholder IDs across relations, reloads and retries until the server provides the real ones.

- **Zero runtime dependencies.** IndexedDB, Web Locks, BroadcastChannel and `crypto` do the heavy lifting.
- **Optimistic UI done right.** Confirmed state and pending changes are kept separate, so rollbacks and conflicts can't corrupt your data.
- **Multi-tab safe.** Tabs elect a leader; a queued action is never submitted twice.
- **Framework-agnostic**, with official Vue and React bindings.

## Packages

| Package | What it is |
|---|---|
| [`@eremitejs/core`](packages/core) | The store: collections, mutators, the outbox, IDs and refs, pulls, conflicts, persistence, multi-tab. |
| [`@eremitejs/vue`](packages/vue) | Vue 3 composables: `useQuery`, `usePull`, `useSyncStatus`. |
| [`@eremitejs/react`](packages/react) | React hooks: `useQuery`, `usePull`, `useSyncStatus`. |

## Quickstart

```bash
npm install @eremitejs/core
npm install @eremitejs/vue    # or @eremitejs/react
```

Define a store — collections hold your data, mutators describe local changes, push handlers do the network calls:

```ts
// store.ts
import { collection, createStore } from '@eremitejs/core'

interface Todo { id: string; title: string; done: boolean }

export const store = createStore({
  name: 'app',
  collections: {
    todos: collection<Todo>()
  },
  mutators: {
    addTodo (tx, input: Todo) {
      tx.todos.set(input.id, input)
    },
    toggleTodo (tx, input: { id: string }) {
      tx.todos.update(input.id, t => { t.done = !t.done })
    }
  },
  push: {
    async addTodo ({ input, idempotencyKey }) {
      await fetch('/api/todos', {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify(input)
      })
    },
    async toggleTodo ({ input }) {
      await fetch(`/api/todos/${input.id}/toggle`, { method: 'PATCH' })
    }
  },
  pulls: {
    todos: {
      fetch: async () => await (await fetch('/api/todos')).json(),
      write (tx, todos: Todo[]) {
        for (const todo of todos) tx.todos.set(todo.id, todo)
      }
    }
  }
})
```

Then use it — this is a Vue component, but the React hooks look the same:

```vue
<script setup lang="ts">
import { useQuery, usePull, useSyncStatus } from '@eremitejs/vue'
import { store } from './store'

usePull(store, 'todos')
const todos = useQuery(store, s => s.todos.all())
const { online, pendingOps } = useSyncStatus(store)

function add (title: string) {
  store.mutate.addTodo({ id: store.id(), title, done: false })
}
</script>

<template>
  <TodoItem v-for="t in todos" :key="t.id" :todo="t" :saving="t.$pending" />
  <OfflineBanner v-if="!online" :queued="pendingOps" />
</template>
```

That's the whole offline story: the new todo renders instantly (flagged `$pending` until the server confirms it), works the same with or without a connection, and a queued change survives closing the browser mid-flight.

From here:

- **[Documentation](https://docs.eremitejs.org)** — how the store works, server-assigned IDs and relations, error handling and conflicts, storage and versioning, multi-tab behavior.
- **[`@eremitejs/vue`](packages/vue)** / **[`@eremitejs/react`](packages/react)** — the binding APIs for your framework.

## Examples

Four small, runnable apps — each available in a Vue and a React version:

| Example | What it shows |
|---|---|
| [`hacker-news-vue`](examples/hacker-news-vue) / [`hacker-news-react`](examples/hacker-news-react) | A read-heavy app against a real API: stories cached for offline reading, read marks stored with local-only mutators. |
| [`tasks-vue`](examples/tasks-vue) / [`tasks-react`](examples/tasks-react) | The full write path against a simulated flaky backend with server-assigned IDs: the outbox, placeholder refs, retries and the conflict UI. Runs entirely in your browser. |

```bash
pnpm install
pnpm --filter example-tasks-vue dev
```

## Development

```bash
pnpm install
pnpm build        # build all packages and examples
pnpm test         # run all test suites
pnpm typecheck    # tsc --noEmit across packages
```

## License

MIT
