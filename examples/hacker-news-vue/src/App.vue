<script setup lang="ts">
import { usePull, useQuery, useSyncStatus } from '@eremitejs/vue'
import { store } from './store'

const { loading, error, refetch } = usePull(store, 'topStories')
const stories = useQuery(store, s => [...s.stories.all()].sort((a, b) => b.score - a.score))
const readIds = useQuery(store, s => new Set(s.read.keys()))
const { online } = useSyncStatus(store)

function markRead (id: number): void {
  store.mutate.markRead({ id: String(id) })
}

function domain (url?: string): string {
  if (!url) return 'news.ycombinator.com'
  try { return new URL(url).hostname } catch { return '' }
}
</script>

<template>
  <main>
    <header>
      <h1>Offline Hacker News</h1>
      <span class="status" :class="online ? 'online' : 'offline'">
        {{ online ? 'online' : 'offline — showing cached stories' }}
      </span>
      <button :disabled="loading" @click="refetch">
        {{ loading ? 'Refreshing…' : 'Refresh' }}
      </button>
    </header>

    <p v-if="error" class="error">
      Could not reach Hacker News — the list below is your offline cache.
    </p>
    <p v-else-if="loading && stories.length === 0">Loading top stories…</p>
    <p v-else-if="stories.length === 0">No stories cached yet. Go online and refresh once.</p>

    <ol>
      <li v-for="story in stories" :key="story.id" :class="{ read: readIds.has(String(story.id)) }">
        <a :href="story.url ?? `https://news.ycombinator.com/item?id=${story.id}`"
           target="_blank" rel="noreferrer" @click="markRead(story.id)">
          {{ story.title }}
        </a>
        <small>({{ domain(story.url) }}) — {{ story.score }} points by {{ story.by }}</small>
      </li>
    </ol>
  </main>
</template>

<style>
body { font-family: system-ui, sans-serif; margin: 0; background: #f6f6ef; color: #1a1a1a; }
main { max-width: 44rem; margin: 0 auto; padding: 1rem; }
header { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
h1 { font-size: 1.2rem; margin: 0.5rem 0; color: #d15a00; }
.status { font-size: 0.8rem; padding: 0.15rem 0.5rem; border-radius: 999px; }
.status.online { background: #d9f2dd; color: #1d6b2c; }
.status.offline { background: #fbe3c9; color: #8a4b00; }
ol { padding-left: 1.5rem; }
li { margin: 0.45rem 0; line-height: 1.35; }
li a { color: inherit; text-decoration: none; }
li a:hover { text-decoration: underline; }
li.read a { color: #888; }
li small { color: #777; display: block; }
.error { background: #fbe3c9; padding: 0.5rem 0.75rem; border-radius: 6px; }
button { border: 1px solid #d15a00; background: white; color: #d15a00; padding: 0.25rem 0.75rem; border-radius: 6px; cursor: pointer; }
button:disabled { opacity: 0.5; cursor: default; }
</style>
