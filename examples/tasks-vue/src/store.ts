import { collection, createStore } from '@eremitejs/core'
import { api } from './fake-api'
import type { ServerTask } from './fake-api'

export interface Task {
  id: string
  title: string
  done: boolean
}

export const store = createStore({
  name: 'tasks',
  version: 1,
  collections: {
    tasks: collection<Task>()
  },
  retry: { maxAttempts: 3, baseDelayMs: 1500, maxDelayMs: 8000 },

  mutators: {
    // The fake server assigns its own IDs, so this uses a ref: the task is
    // keyed by a placeholder until the push resolves the real ID.
    addTask (tx, input: { title: string }, ctx) {
      const id = ctx.ref('task')
      tx.tasks.set(id, { id, title: input.title, done: false })
      return { id }
    },
    setDone (tx, input: { id: string | number, done: boolean }) {
      tx.tasks.update(input.id, t => { t.done = input.done })
    },
    removeTask (tx, input: { id: string | number }) {
      tx.tasks.delete(input.id)
    }
  },

  push: {
    async addTask ({ input, resolve, idempotencyKey }) {
      const created = await api.createTask(input, idempotencyKey)
      resolve('task', created.id)
    },
    async setDone ({ input }) {
      await api.updateTask(Number(input.id), { done: input.done })
    },
    async removeTask ({ input }) {
      await api.deleteTask(Number(input.id))
    }
  },

  pulls: {
    tasks: {
      fetch: async () => await api.listTasks(),
      write (tx, tasks: ServerTask[]) {
        // full replacement: drop rows the server no longer has
        for (const id of tx.tasks.keys()) {
          if (!tasks.some(t => String(t.id) === id)) tx.tasks.delete(id)
        }
        for (const task of tasks) {
          tx.tasks.set(task.id, { id: String(task.id), title: task.title, done: task.done })
        }
      }
    }
  }
})
