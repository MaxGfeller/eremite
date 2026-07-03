import { expect, test } from 'vitest'
import { collectRefs, isRef, mintRef, substituteRefs, uuidv7 } from '../src'

test('uuidv7 has valid format and version bits', () => {
  const id = uuidv7()
  expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
})

test('uuidv7 values are unique and time-sortable', () => {
  const ids = Array.from({ length: 1000 }, () => uuidv7())
  expect(new Set(ids).size).toBe(1000)
  const sorted = [...ids].sort()
  expect(sorted).toEqual(ids)
})

test('mintRef / isRef', () => {
  const ref = mintRef()
  expect(isRef(ref)).toBe(true)
  expect(isRef('some-plain-id')).toBe(false)
  expect(isRef(42)).toBe(false)
  expect(isRef(null)).toBe(false)
})

test('collectRefs finds refs in nested values and object keys', () => {
  const a = mintRef()
  const b = mintRef()
  const c = mintRef()
  const refs = collectRefs({
    plain: 'x',
    direct: a,
    nested: { list: [1, b, { deep: 'y' }] },
    [c]: 'used-as-key'
  })
  expect(refs).toEqual(new Set([a, b, c]))
})

test('substituteRefs replaces resolved refs in values and keys, leaves unresolved ones', () => {
  const resolved = mintRef()
  const unresolvedRef = mintRef()
  const map = new Map([[resolved, 42]])

  const input = {
    invoiceId: resolved,
    otherId: unresolvedRef,
    items: [{ parent: resolved }],
    [resolved]: 'keyed'
  }
  const output = substituteRefs(input, ref => map.get(ref))

  expect(output.invoiceId).toBe(42)
  expect(output.otherId).toBe(unresolvedRef)
  expect(output.items[0].parent).toBe(42)
  expect((output as Record<string, unknown>)['42']).toBe('keyed')
  // the original is untouched
  expect(input.invoiceId).toBe(resolved)
})

test('substituteRefs returns fresh structures', () => {
  const input = { nested: { a: 1 } }
  const output = substituteRefs(input, () => undefined)
  expect(output).toEqual(input)
  expect(output).not.toBe(input)
  expect(output.nested).not.toBe(input.nested)
})
