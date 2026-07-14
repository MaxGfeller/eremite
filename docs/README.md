# Eremite.js docs

Mintlify documentation site. Content lives in `.mdx` files; navigation, theme and metadata in [`docs.json`](docs.json).

## Local preview

The `mint` CLI is a local dev dependency of this workspace package. From the repo root:

```bash
pnpm install
pnpm docs:dev      # live-reloading preview at http://localhost:3000
pnpm docs:check    # validate internal links
```

## Deployment

1. Create a project on [mintlify.com](https://mintlify.com) and connect the GitHub repo.
2. Set the docs directory to `docs/`. Pushes to `main` deploy automatically.
3. Point `docs.eremitejs.org` at it in the Mintlify dashboard. The website (`website/app/app.vue`) already links there.

## Structure

- `introduction.mdx`, `quickstart.mdx`, `examples.mdx` — getting started
- `concepts/` — the core model: how it works, collections, mutators, push, pulls, IDs & refs, conflicts, storage, multi-tab
- `frameworks/` — Vue, React, and building your own binding
- `comparisons/` — vs. Replicache, TanStack Query, RxDB, sync engines
- `api/` — reference for `@eremitejs/core`, `@eremitejs/vue`, `@eremitejs/react`
