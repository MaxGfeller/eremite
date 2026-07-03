# @eremitejs/vue

Vue 3 composables for [Eremite](https://github.com/eremitejs/eremite), the offline-first data layer for apps talking to any REST backend.

```bash
npm install @eremitejs/core @eremitejs/vue
```

## Usage

```vue
<script setup lang="ts">
import { useQuery, usePull, useSyncStatus } from '@eremitejs/vue'
import { store } from '../store' // your createStore() instance

const props = defineProps<{ projectId: string }>()

// reactive selection over the optimistic snapshot
const todos = useQuery(store, s => s.todos.where(t => t.projectId === props.projectId))

// server read; re-runs when args change
const { loading, error, refetch } = usePull(store, 'todos', () => ({ projectId: props.projectId }))

// connectivity, outbox depth, conflicts
const { online, syncing, pendingOps, conflicts } = useSyncStatus(store)
</script>

<template>
  <TodoItem v-for="t in todos" :key="t.id" :todo="t" :pending="t.$pending" />
  <OfflineBanner v-if="!online" :queued="pendingOps" />
</template>
```

## API

- **`useQuery(store, selector)`** → `ComputedRef` that recomputes on every store change.
- **`usePull(store, name, args?)`** → `{ loading, error, refetch }`; `args` may be a ref or getter and re-triggers the pull when it changes.
- **`useSyncStatus(store)`** → `{ online, syncing, pendingOps, conflicts }` as computed refs.

See the [core documentation](https://github.com/eremitejs/eremite/tree/main/packages/core) for stores, mutators, refs and conflicts, and [`examples/hacker-news-vue`](https://github.com/eremitejs/eremite/tree/main/examples/hacker-news-vue) / [`examples/tasks-vue`](https://github.com/eremitejs/eremite/tree/main/examples/tasks-vue) for runnable apps.

## License

MIT
