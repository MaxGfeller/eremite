import { collection, createStore } from '@eremitejs/core'

export interface Story {
  id: number
  title: string
  url?: string
  by: string
  score: number
  time: number
  descendants?: number
}

interface ReadMark { id: string }

const HN = 'https://hacker-news.firebaseio.com/v0'

export const store = createStore({
  name: 'hacker-news',
  version: 1,
  collections: {
    stories: collection<Story>(),
    read: collection<ReadMark>()
  },
  mutators: {
    // Local-only (no push handler): commits straight to IndexedDB and
    // survives reloads — your read marks work fully offline.
    markRead (tx, input: { id: string }) {
      tx.read.set(input.id, { id: input.id })
    }
  },
  pulls: {
    topStories: {
      async fetch () {
        const response = await fetch(`${HN}/topstories.json`)
        const ids: number[] = await response.json()
        const stories = await Promise.all(ids.slice(0, 30).map(async id => {
          const item = await fetch(`${HN}/item/${id}.json`)
          return await item.json() as Story | null
        }))
        return stories.filter((s): s is Story => s !== null)
      },
      write (tx, stories: Story[]) {
        for (const story of stories) tx.stories.set(story.id, story)
      }
    }
  }
})
