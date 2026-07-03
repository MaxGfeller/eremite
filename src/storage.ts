/**
 * Storage adapters.
 *
 * Eremite persists three kinds of data:
 *  - per-record base-state rows (`b:<collection>:<key>`) — the big data
 *  - small single-document structures (`ops`, `idmap`, `conflicts`, `meta`)
 *
 * The default browser adapter uses IndexedDB directly (no localForage, no
 * localStorage fallback — every relevant browser has had IndexedDB for a
 * decade). The memory adapter serves tests and SSR.
 */

export interface StorageAdapter {
  get: (key: string) => Promise<unknown>
  set: (key: string, value: unknown) => Promise<void>
  delete: (key: string) => Promise<void>
  /** All entries whose key starts with `prefix`. */
  entries: (prefix: string) => Promise<Array<[string, unknown]>>
  clear: () => Promise<void>
}

export function memoryStorage (): StorageAdapter {
  const map = new Map<string, unknown>()
  return {
    async get (key) { return map.has(key) ? structuredClone(map.get(key)) : undefined },
    async set (key, value) { map.set(key, structuredClone(value)) },
    async delete (key) { map.delete(key) },
    async entries (prefix) {
      const out: Array<[string, unknown]> = []
      for (const [key, value] of map) {
        if (key.startsWith(prefix)) out.push([key, structuredClone(value)])
      }
      return out
    },
    async clear () { map.clear() }
  }
}

const IDB_STORE = 'kv'

export function idbStorage (dbName: string): StorageAdapter {
  const dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(dbName, 1)
    req.onupgradeneeded = () => { req.result.createObjectStore(IDB_STORE) }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error(`Failed to open IndexedDB database \`${dbName}\``))
  })

  async function withStore<T> (
    mode: IDBTransactionMode,
    fn: (store: IDBObjectStore) => IDBRequest<T>
  ): Promise<T> {
    const db = await dbPromise
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, mode)
      const req = fn(tx.objectStore(IDB_STORE))
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'))
    })
  }

  return {
    async get (key) {
      const value = await withStore('readonly', s => s.get(key))
      return value === undefined ? undefined : value
    },
    async set (key, value) {
      await withStore('readwrite', s => s.put(value, key))
    },
    async delete (key) {
      await withStore('readwrite', s => s.delete(key))
    },
    async entries (prefix) {
      const range = IDBKeyRange.bound(prefix, prefix + '￿')
      const db = await dbPromise
      return await new Promise((resolve, reject) => {
        const out: Array<[string, unknown]> = []
        const tx = db.transaction(IDB_STORE, 'readonly')
        const req = tx.objectStore(IDB_STORE).openCursor(range)
        req.onsuccess = () => {
          const cursor = req.result
          if (cursor) {
            out.push([String(cursor.key), cursor.value])
            cursor.continue()
          } else {
            resolve(out)
          }
        }
        req.onerror = () => reject(req.error ?? new Error('IndexedDB cursor failed'))
      })
    },
    async clear () {
      await withStore('readwrite', s => s.clear())
    }
  }
}

export function defaultStorage (name: string): StorageAdapter {
  if (typeof indexedDB !== 'undefined') return idbStorage(`eremite:${name}`)
  return memoryStorage()
}
