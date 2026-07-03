import { expect, test } from 'vitest'
import { CollectionSnapshot, DraftCollection } from '../src'

interface Item { id: string, label: string, tags: string[] }

function baseMap (): Map<string, Item> {
  return new Map([
    ['a', { id: 'a', label: 'Alpha', tags: ['x'] }],
    ['b', { id: 'b', label: 'Beta', tags: [] }]
  ])
}

test('a draft without writes reuses the base map', () => {
  const base = baseMap()
  const draft = new DraftCollection(base)

  expect(draft.get('a')).toMatchObject({ label: 'Alpha' })
  expect(draft.changed).toBe(false)
  expect(draft.result()).toBe(base)
})

test('the first write clones the map; the base is never touched', () => {
  const base = baseMap()
  const draft = new DraftCollection(base)

  draft.set('c', { id: 'c', label: 'Gamma', tags: [] })
  expect(draft.changed).toBe(true)
  expect(draft.result()).not.toBe(base)
  expect(base.has('c')).toBe(false)
  expect(draft.has('c')).toBe(true)
  expect(draft.keys()).toEqual(['a', 'b', 'c'])
})

test('update clones the entity, never mutating the base entity', () => {
  const base = baseMap()
  const original = base.get('a')!
  const draft = new DraftCollection(base)

  draft.update('a', item => { item.label = 'Changed'; item.tags.push('y') })

  expect(original.label).toBe('Alpha')
  expect(original.tags).toEqual(['x'])
  expect(draft.get('a')).toMatchObject({ label: 'Changed', tags: ['x', 'y'] })
  expect(draft.written.has('a')).toBe(true)
})

test('update on a missing entity is a no-op (replays must not throw)', () => {
  const draft = new DraftCollection(baseMap())
  draft.update('nope', item => { (item as Item).label = 'x' })
  expect(draft.changed).toBe(false)
  expect(draft.written.size).toBe(0)
})

test('get returns defensive copies', () => {
  const draft = new DraftCollection(baseMap())
  const copy = draft.get('a')!
  copy.label = 'mutated from outside'
  expect(draft.get('a')!.label).toBe('Alpha')
})

test('set stores a clone of the given value', () => {
  const draft = new DraftCollection(new Map<string, Item>())
  const input = { id: 'n', label: 'New', tags: ['t'] }
  draft.set('n', input)
  input.label = 'mutated after set'
  expect(draft.get('n')!.label).toBe('New')
})

test('delete tracks removals and un-tracks writes', () => {
  const draft = new DraftCollection(baseMap())
  draft.set('c', { id: 'c', label: 'Gamma', tags: [] })
  draft.delete('c')
  draft.delete('a')
  draft.delete('missing')

  expect(draft.written.has('c')).toBe(false)
  expect(draft.deleted).toEqual(new Set(['c', 'a']))
  expect(draft.has('a')).toBe(false)
})

test('numeric keys are coerced to strings consistently', () => {
  const draft = new DraftCollection(new Map<string, Item>())
  draft.set(42, { id: '42', label: 'Answer', tags: [] })
  expect(draft.get('42')).toBeDefined()
  expect(draft.get(42)).toBeDefined()

  const snapshot = new CollectionSnapshot(draft.result())
  expect(snapshot.get(42)).toMatchObject({ label: 'Answer' })
  expect(snapshot.has('42')).toBe(true)
})

test('snapshot query helpers', () => {
  const snapshot = new CollectionSnapshot(baseMap())
  expect(snapshot.size).toBe(2)
  expect(snapshot.keys()).toEqual(['a', 'b'])
  expect(snapshot.all().map(i => i.label)).toEqual(['Alpha', 'Beta'])
  expect(snapshot.where(i => i.tags.length > 0).map(i => i.id)).toEqual(['a'])
  expect(snapshot.entries()[1]).toEqual(['b', { id: 'b', label: 'Beta', tags: [] }])
})
