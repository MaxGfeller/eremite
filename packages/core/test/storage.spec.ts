import 'fake-indexeddb/auto'
import { describe, expect, test } from 'vitest'
import { idbStorage, memoryStorage } from '../src'
import type { StorageAdapter } from '../src'

function adapterContract (name: string, make: () => StorageAdapter): void {
  describe(name, () => {
    test('get/set/delete roundtrip', async () => {
      const storage = make()
      expect(await storage.get('missing')).toBeUndefined()

      await storage.set('key', { nested: { value: 1 } })
      expect(await storage.get('key')).toEqual({ nested: { value: 1 } })

      await storage.delete('key')
      expect(await storage.get('key')).toBeUndefined()
    })

    test('entries filters by prefix', async () => {
      const storage = make()
      await storage.set('b:todos:1', { id: '1' })
      await storage.set('b:todos:2', { id: '2' })
      await storage.set('b:projects:1', { id: 'p1' })
      await storage.set('ops', [])

      const todoRows = await storage.entries('b:todos:')
      expect(todoRows.map(([key]) => key).sort()).toEqual(['b:todos:1', 'b:todos:2'])

      const baseRows = await storage.entries('b:')
      expect(baseRows).toHaveLength(3)
    })

    test('clear removes everything', async () => {
      const storage = make()
      await storage.set('a', 1)
      await storage.set('b', 2)
      await storage.clear()
      expect(await storage.entries('')).toHaveLength(0)
    })

    test('stored values are isolated from later mutation', async () => {
      const storage = make()
      const value = { list: [1, 2] }
      await storage.set('key', value)
      value.list.push(3)
      expect(await storage.get('key')).toEqual({ list: [1, 2] })
    })
  })
}

adapterContract('memoryStorage', () => memoryStorage())

let idbCounter = 0
adapterContract('idbStorage (fake-indexeddb)', () => idbStorage(`test-db-${idbCounter++}`))
