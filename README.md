# Eremite.js

**An offline-first data layer for apps that talk to any REST backend.**

Eremite gives your app a local, optimistic view of server data that keeps working without a connection. Writes go into a persistent outbox and are pushed to your API when connectivity allows — in order, exactly once, surviving page reloads. Unlike sync engines, Eremite requires **nothing special on the server**: if you can call it with `fetch`, you can go offline-first with it.

- **Zero runtime dependencies** — IndexedDB, Web Locks, BroadcastChannel and `crypto` do the heavy lifting.
- **First-class IDs and relations**, including backends that insist on assigning IDs themselves.
- **Framework-agnostic core** with Vue and React bindings.

## Packages

| Package | Description |
|---|---|
| [`@eremitejs/core`](packages/core) | The store: collections, mutators, outbox, rebase, refs, pulls, conflicts, persistence, multi-tab. **Start with its README — it's the main documentation.** |
| [`@eremitejs/vue`](packages/vue) | Vue 3 composables: `useQuery`, `usePull`, `useSyncStatus`. |
| [`@eremitejs/react`](packages/react) | React hooks: `useQuery`, `usePull`, `useSyncStatus`. |

## Examples

| Example | What it shows |
|---|---|
| [`examples/hacker-news-vue`](examples/hacker-news-vue) / [`-react`](examples/hacker-news-react) | Read-heavy app against a real API: pulled stories cached for offline reading, local-only mutators for read marks. |
| [`examples/tasks-vue`](examples/tasks-vue) / [`-react`](examples/tasks-react) | The hard paths, fully self-contained: a simulated flaky backend with server-assigned IDs driving refs, the outbox, retries and the conflict UI. Try an outage, reload mid-queue, or add a task titled `!reject`. |

```bash
pnpm install
pnpm --filter example-tasks-vue dev
```

## Taste

```ts
import { collection, createStore } from '@eremitejs/core'

const store = createStore({
  name: 'app',
  collections: { todos: collection<Todo>() },
  mutators: {
    createTodo (tx, input: Todo) { tx.todos.set(input.id, input) }
  },
  push: {
    createTodo: async ({ input, idempotencyKey }) => {
      await api.post('/todos', input, { idempotencyKey })
    }
  }
})

const { done } = store.mutate.createTodo({ id: store.id(), title: 'Ship it', done: false })
// visible immediately (marked $pending), queued offline, pushed on reconnect
```

## Development

```bash
pnpm install
pnpm build        # build packages and examples
pnpm test         # build packages, run all test suites
pnpm typecheck    # tsc --noEmit across packages
```

Releases: bump versions, tag `v*.*.*`, push — CI tests, builds and publishes all packages to npm.

## License

MIT
