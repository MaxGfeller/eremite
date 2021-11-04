import { TemporaryIdentifier, createTemporaryIdentifier } from '../src'

test('Creates a new temporary identifier', () => {
  const id = createTemporaryIdentifier()
  expect(id).toBeTruthy()
  expect(id).toBeInstanceOf(TemporaryIdentifier)
  expect(id.getTemporaryId()).toBeTruthy()
  expect(id.getTemporaryId().length).toBe(36)
})

test('Actual ID can be updated', () => {
  const id = createTemporaryIdentifier()
  id.updateId('123')
  expect(id.getId()).toBe('123')
})
