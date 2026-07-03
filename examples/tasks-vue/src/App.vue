<script setup lang="ts">
import { ref } from 'vue'
import { isRef as isEremiteRef } from '@eremitejs/core'
import { usePull, useQuery, useSyncStatus } from '@eremitejs/vue'
import { serverState } from './fake-api'
import { store } from './store'

const newTitle = ref('')
const serverDown = ref(serverState.down)

const { loading, refetch } = usePull(store, 'tasks')
const tasks = useQuery(store, s => s.tasks.all())
const { online, pendingOps, conflicts } = useSyncStatus(store)

function addTask (): void {
  const title = newTitle.value.trim()
  if (!title) return
  store.mutate.addTask({ title })
  newTitle.value = ''
}

function toggleServer (): void {
  serverState.down = !serverState.down
  serverDown.value = serverState.down
  if (!serverState.down) store.setOnline(true) // probe immediately
}
</script>

<template>
  <main>
    <h1>Tasks <small>Eremite + Vue, simulated backend</small></h1>

    <section class="toolbar">
      <span class="status" :class="online ? 'online' : 'offline'">
        {{ online ? 'connected' : 'offline — changes are queued' }}
      </span>
      <span v-if="pendingOps > 0" class="badge">{{ pendingOps }} queued</span>
      <button @click="toggleServer">
        {{ serverDown ? 'Bring server back up' : 'Simulate server outage' }}
      </button>
      <button :disabled="loading" @click="refetch">
        {{ loading ? 'Syncing…' : 'Refresh from server' }}
      </button>
    </section>

    <form @submit.prevent="addTask">
      <input v-model="newTitle" placeholder='New task… (try a title with "!reject")' />
      <button type="submit">Add</button>
    </form>

    <ul class="tasks">
      <li v-for="task in tasks" :key="task.id" :class="{ pending: task.$pending }">
        <label>
          <input
            type="checkbox" :checked="task.done"
            @change="store.mutate.setDone({ id: task.id, done: !task.done })"
          />
          <span :class="{ done: task.done }">{{ task.title }}</span>
        </label>
        <span v-if="task.$pending" class="badge">{{ isEremiteRef(task.id) ? 'creating…' : 'saving…' }}</span>
        <button class="delete" @click="store.mutate.removeTask({ id: task.id })">×</button>
      </li>
    </ul>
    <p v-if="tasks.length === 0" class="empty">Nothing here. Add a task — even while "offline".</p>

    <section v-if="conflicts.length > 0" class="conflicts">
      <h2>Rejected by the server</h2>
      <div v-for="conflict in conflicts" :key="conflict.op.id" class="conflict">
        <div>
          <strong>{{ conflict.op.mutator }}</strong>
          <em>{{ conflict.reason }}</em>
          <span v-if="conflict.message"> — {{ conflict.message }}</span>
        </div>
        <button @click="store.retryConflict(conflict.op.id)">Retry</button>
        <button @click="store.discardConflict(conflict.op.id)">Discard</button>
      </div>
    </section>

    <p class="hint">
      The "server" lives in localStorage with artificial latency and its own numeric IDs.
      Queue tasks during an outage, reload the page mid-queue, or add a task titled
      "!reject me" to see a conflict.
    </p>
  </main>
</template>

<style>
body { font-family: system-ui, sans-serif; margin: 0; background: #f4f5f7; color: #1c1e21; }
main { max-width: 38rem; margin: 0 auto; padding: 1.25rem; }
h1 { font-size: 1.4rem; } h1 small { font-size: 0.8rem; color: #667; font-weight: normal; }
.toolbar { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; margin-bottom: 1rem; }
.status { font-size: 0.8rem; padding: 0.2rem 0.6rem; border-radius: 999px; }
.status.online { background: #d9f2dd; color: #1d6b2c; }
.status.offline { background: #fde2e1; color: #a12622; }
.badge { font-size: 0.75rem; background: #ffe9b8; color: #7a5300; padding: 0.15rem 0.5rem; border-radius: 999px; }
form { display: flex; gap: 0.5rem; margin-bottom: 1rem; }
form input { flex: 1; padding: 0.5rem 0.7rem; border: 1px solid #ccc; border-radius: 8px; }
button { border: 1px solid #b9bdc4; background: white; padding: 0.35rem 0.8rem; border-radius: 8px; cursor: pointer; }
button:hover { background: #eef0f3; }
.tasks { list-style: none; padding: 0; }
.tasks li { display: flex; align-items: center; gap: 0.5rem; background: white; border: 1px solid #e3e5e8;
  border-radius: 10px; padding: 0.5rem 0.75rem; margin-bottom: 0.4rem; }
.tasks li.pending { border-style: dashed; opacity: 0.85; }
.tasks label { flex: 1; display: flex; gap: 0.5rem; align-items: center; cursor: pointer; }
.tasks .done { text-decoration: line-through; color: #999; }
.tasks .delete { border: none; background: none; color: #a12622; font-size: 1.1rem; }
.empty, .hint { color: #667; font-size: 0.85rem; }
.conflicts { background: #fde2e1; border-radius: 10px; padding: 0.75rem 1rem; }
.conflicts h2 { font-size: 0.95rem; margin: 0 0 0.5rem; }
.conflict { display: flex; gap: 0.5rem; align-items: center; margin-bottom: 0.4rem; font-size: 0.85rem; }
.conflict div { flex: 1; } .conflict em { color: #a12622; margin-left: 0.3rem; }
</style>
