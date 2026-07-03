import { usePull, useQuery, useSyncStatus } from '@eremitejs/react'
import { store } from './store'

function domain (url?: string): string {
  if (!url) return 'news.ycombinator.com'
  try { return new URL(url).hostname } catch { return '' }
}

export function App () {
  const { loading, error, refetch } = usePull(store, 'topStories')
  const stories = useQuery(store, s => [...s.stories.all()].sort((a, b) => b.score - a.score))
  const readIds = useQuery(store, s => new Set(s.read.keys()))
  const { online } = useSyncStatus(store)

  return (
    <main>
      <header>
        <h1>Offline Hacker News</h1>
        <span className={`status ${online ? 'online' : 'offline'}`}>
          {online ? 'online' : 'offline — showing cached stories'}
        </span>
        <button disabled={loading} onClick={() => { void refetch() }}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>

      {error != null && (
        <p className="error">Could not reach Hacker News — the list below is your offline cache.</p>
      )}
      {error == null && loading && stories.length === 0 && <p>Loading top stories…</p>}
      {error == null && !loading && stories.length === 0 && (
        <p>No stories cached yet. Go online and refresh once.</p>
      )}

      <ol>
        {stories.map(story => (
          <li key={story.id} className={readIds.has(String(story.id)) ? 'read' : ''}>
            <a
              href={story.url ?? `https://news.ycombinator.com/item?id=${story.id}`}
              target="_blank" rel="noreferrer"
              onClick={() => store.mutate.markRead({ id: String(story.id) })}
            >
              {story.title}
            </a>
            <small>({domain(story.url)}) — {story.score} points by {story.by}</small>
          </li>
        ))}
      </ol>
    </main>
  )
}
