# @eremitejs/react

React hooks for [Eremite](https://github.com/MaxGfeller/eremite), the offline-first data layer for apps talking to any REST backend.

```bash
npm install @eremitejs/core @eremitejs/react
```

## Usage

```tsx
import { useQuery, usePull, useSyncStatus } from '@eremitejs/react'
import { store } from './store' // your createStore() instance

export function TodoList ({ projectId }: { projectId: string }) {
  // re-renders on every store change; selector runs against the latest snapshot
  const todos = useQuery(store, s => s.todos.where(t => t.projectId === projectId))

  // server read; re-runs when args change (compared by value)
  const { loading, error, refetch } = usePull(store, 'todos', { projectId })

  // connectivity, outbox depth, conflicts
  const { online, pendingOps, conflicts } = useSyncStatus(store)

  return (
    <>
      {todos.map(t => <TodoItem key={t.id} todo={t} pending={t.$pending} />)}
      {!online && <OfflineBanner queued={pendingOps} />}
    </>
  )
}
```

## API

- **`useQuery(store, selector)`** → the selected value, re-rendered on every store change (built on `useSyncExternalStore`).
- **`usePull(store, name, args?)`** → `{ loading, error, refetch }`.
- **`useSyncStatus(store)`** → `{ online, syncing, pendingOps, conflicts }`.
- **`useStoreVersion(store)`** → low-level change subscription for building custom hooks.

See the [core documentation](https://github.com/MaxGfeller/eremite/tree/main/packages/core) for stores, mutators, refs and conflicts, and [`examples/hacker-news-react`](https://github.com/MaxGfeller/eremite/tree/main/examples/hacker-news-react) / [`examples/tasks-react`](https://github.com/MaxGfeller/eremite/tree/main/examples/tasks-react) for runnable apps.

## License

MIT
