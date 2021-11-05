import { EremitePlugin } from '../Eremite'

export function MemoryCache (opts: { cacheSize?: number} = {}): EremitePlugin {
  const cacheSize = opts.cacheSize ?? 2000

  const cache: { [key: string]: { value: any, timestamp: number } } = {}

  const cleanup = (): void => {
    const sorted = Object.entries(cache).sort(([keyA, valueA], [keyB, valueB]) => {
      if (valueA.timestamp < valueB.timestamp) {
        return -1
      }
      return 1
    })

    if (sorted.length > cacheSize) {
      const toRemove = sorted.slice(cacheSize)
      toRemove.forEach(([key, value]) => {
        // eslint-disable-next-line
        delete cache[key]
      })
    }
  }

  return {
    setItem: {
      after: async (key: string, value: any, next: (key: string, value: any) => void) => {
        if (!cache[key]) {
          cache[key] = { value, timestamp: Date.now() }
        } else {
          cache[key].value = value
          cache[key].timestamp = Date.now()
        }

        cleanup()

        next(key, value)
      }
    },
    getItem: {
      before: async (key: string, value: any, next: (key: string, value: any) => void) => {
        if (cache[key]) {
          cache[key].timestamp = Date.now()
          return cache[key]
        } else {
          next(key, value)
        }
      }
    }
  }
}
