# Tasks example (Vue)

A task list demonstrating Eremite's full write path against a **simulated backend** that behaves like a typical REST API: latency, its own numeric IDs, and outages you can trigger with a button. Everything runs in your browser — the "server" lives in localStorage.

```bash
pnpm install
pnpm --filter example-tasks-vue dev
```

Things to try:

- **Add tasks while "offline".** Hit *Simulate server outage*, then add, toggle and delete tasks. Changes apply instantly, queue up, and drain in order once you bring the server back.
- **Reload mid-queue.** Queue a few changes during an outage and reload the page: the pending changes (and the outage) survive, and syncing resumes where it left off.
- **Server-assigned IDs.** New tasks are keyed by a placeholder ref until the server assigns their real ID — including edits made to a task that hasn't been created on the server yet.
- **Conflicts.** Add a task with `!reject` in the title: the server refuses it with a 422, the optimistic row rolls back, and the conflict panel lets you retry or discard — along with any queued changes that depended on it.

The interesting files are [`src/store.ts`](src/store.ts) (collections, mutators, push handlers, pull) and [`src/fake-api.ts`](src/fake-api.ts) (the simulated backend).
