# Offline Hacker News (React)

A read-heavy Eremite app against the real [Hacker News API](https://github.com/HackerNews/API): the top 30 stories are pulled into local base state and cached in IndexedDB, so the list renders instantly on your next visit — connection or not.

```bash
pnpm install
pnpm --filter example-hacker-news-react dev
```

Things to try:

- **Load once, read offline.** After the first refresh, go offline (browser devtools or airplane mode) and reload: the cached stories are still there.
- **Read marks.** Clicking a story marks it read via a *local-only mutator* — no push handler, so it commits straight to local storage and survives reloads without any server.

The interesting file is [`src/store.ts`](src/store.ts): one pull for the story list, one local-only mutator for read marks.
