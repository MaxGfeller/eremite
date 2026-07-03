import { useState } from 'react'
import { isRef as isEremiteRef } from '@eremitejs/core'
import { usePull, useQuery, useSyncStatus } from '@eremitejs/react'
import { serverState } from './fake-api'
import { store } from './store'

export function App () {
  const [newTitle, setNewTitle] = useState('')
  const [serverDown, setServerDown] = useState(serverState.down)

  const { loading, refetch } = usePull(store, 'tasks')
  const tasks = useQuery(store, s => s.tasks.all())
  const { online, pendingOps, conflicts } = useSyncStatus(store)

  function addTask (event: React.FormEvent): void {
    event.preventDefault()
    const title = newTitle.trim()
    if (!title) return
    store.mutate.addTask({ title })
    setNewTitle('')
  }

  function toggleServer (): void {
    serverState.down = !serverState.down
    setServerDown(serverState.down)
    if (!serverState.down) store.setOnline(true) // probe immediately
  }

  return (
    <main>
      <h1>Tasks <small>Eremite + React, simulated backend</small></h1>

      <section className="toolbar">
        <span className={`status ${online ? 'online' : 'offline'}`}>
          {online ? 'connected' : 'offline — changes are queued'}
        </span>
        {pendingOps > 0 && <span className="badge">{pendingOps} queued</span>}
        <button onClick={toggleServer}>
          {serverDown ? 'Bring server back up' : 'Simulate server outage'}
        </button>
        <button disabled={loading} onClick={() => { void refetch() }}>
          {loading ? 'Syncing…' : 'Refresh from server'}
        </button>
      </section>

      <form onSubmit={addTask}>
        <input
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          placeholder='New task… (try a title with "!reject")'
        />
        <button type="submit">Add</button>
      </form>

      <ul className="tasks">
        {tasks.map(task => (
          <li key={task.id} className={task.$pending ? 'pending' : ''}>
            <label>
              <input
                type="checkbox" checked={task.done}
                onChange={() => store.mutate.setDone({ id: task.id, done: !task.done })}
              />
              <span className={task.done ? 'done' : ''}>{task.title}</span>
            </label>
            {task.$pending && (
              <span className="badge">{isEremiteRef(task.id) ? 'creating…' : 'saving…'}</span>
            )}
            <button className="delete" onClick={() => store.mutate.removeTask({ id: task.id })}>×</button>
          </li>
        ))}
      </ul>
      {tasks.length === 0 && <p className="empty">Nothing here. Add a task — even while "offline".</p>}

      {conflicts.length > 0 && (
        <section className="conflicts">
          <h2>Rejected by the server</h2>
          {conflicts.map(conflict => (
            <div key={conflict.op.id} className="conflict">
              <div>
                <strong>{conflict.op.mutator}</strong>
                <em>{conflict.reason}</em>
                {conflict.message != null && <span> — {conflict.message}</span>}
              </div>
              <button onClick={() => store.retryConflict(conflict.op.id)}>Retry</button>
              <button onClick={() => store.discardConflict(conflict.op.id)}>Discard</button>
            </div>
          ))}
        </section>
      )}

      <p className="hint">
        The "server" lives in localStorage with artificial latency and its own numeric IDs.
        Queue tasks during an outage, reload the page mid-queue, or add a task titled
        "!reject me" to see a conflict.
      </p>
    </main>
  )
}
