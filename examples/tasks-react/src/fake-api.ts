/**
 * A simulated REST backend, so this example is completely self-contained.
 *
 * It behaves like the awkward-but-typical server Eremite is designed for:
 * - it assigns its own numeric IDs (the client can't choose them)
 * - it has latency
 * - it can be "taken down" (throws the same TypeError a dead fetch() would)
 * - it deduplicates creates via an idempotency key
 * - it rejects tasks whose title contains "!reject" with a 422, so you can
 *   see Eremite's conflict handling
 *
 * Its state lives in localStorage, so the "server" survives reloads too.
 */

export interface ServerTask {
  id: number
  title: string
  done: boolean
}

interface Db {
  nextId: number
  tasks: ServerTask[]
  seenKeys: Record<string, number>
  down?: boolean
}

const STORAGE_KEY = 'eremite-example-fake-server'

function load (): Db {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as Db
  } catch { /* corrupted or unavailable: start fresh */ }
  return { nextId: 1, tasks: [], seenKeys: {} }
}

const db = load()

function save (): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db))
}

/** Flip `down` to simulate the backend being unreachable. The flag is
 * persisted with the rest of the "server", so an outage survives reloads —
 * which is exactly the scenario worth playing with. */
export const serverState = {
  get down (): boolean { return db.down ?? false },
  set down (value: boolean) { db.down = value; save() }
}

async function latency (): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 350 + Math.random() * 350))
}

function guard (): void {
  if (serverState.down) throw new TypeError('fetch failed (simulated outage)')
}

function httpError (status: number, message: string): Error & { status: number } {
  return Object.assign(new Error(message), { status })
}

export const api = {
  async listTasks (): Promise<ServerTask[]> {
    await latency()
    guard()
    return structuredClone(db.tasks)
  },

  async createTask (input: { title: string }, idempotencyKey: string): Promise<ServerTask> {
    await latency()
    guard()

    const existingId = db.seenKeys[idempotencyKey]
    if (existingId !== undefined) {
      const existing = db.tasks.find(t => t.id === existingId)
      if (existing) return structuredClone(existing)
    }

    if (input.title.includes('!reject')) {
      throw httpError(422, 'The server refuses titles containing "!reject"')
    }

    const task: ServerTask = { id: db.nextId++, title: input.title, done: false }
    db.tasks.push(task)
    db.seenKeys[idempotencyKey] = task.id
    save()
    return structuredClone(task)
  },

  async updateTask (id: number, patch: Partial<Pick<ServerTask, 'title' | 'done'>>): Promise<ServerTask> {
    await latency()
    guard()
    const task = db.tasks.find(t => t.id === id)
    if (!task) throw httpError(404, `No task with id ${id}`)
    Object.assign(task, patch)
    save()
    return structuredClone(task)
  },

  async deleteTask (id: number): Promise<void> {
    await latency()
    guard()
    const index = db.tasks.findIndex(t => t.id === id)
    if (index !== -1) {
      db.tasks.splice(index, 1)
      save()
    }
  }
}
