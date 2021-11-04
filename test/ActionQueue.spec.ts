import { ActionQueue } from '../src'
import { ActionQueueItem } from '../src/ActionQueue'
import { nextTick } from './utils'

let actionQueue: ActionQueue

const executeAction: jest.Mock = jest.fn(async (actionQueueItem: ActionQueueItem): Promise<any> => {
})

const getItem: jest.Mock = jest.fn()
const setItem: jest.Mock = jest.fn()
const applyMutation: jest.Mock = jest.fn()
const commitMutation: jest.Mock = jest.fn()
const cancelMutation: jest.Mock = jest.fn()

test('Init', () => {
  actionQueue = new ActionQueue({
    executeAction,
    getItem,
    setItem,
    applyMutation,
    commitMutation,
    cancelMutation
  })
  expect(actionQueue).toBeTruthy()
})

test('Add action to queue persists it in store', async () => {
  actionQueue.queueAction({
    parameters: [],
    resource: 'foo',
    action: 'bar'
  })
    .catch((err) => expect(err).toBeFalsy())

  await nextTick()

  expect(setItem).toHaveBeenCalled()
  const storeQueue = setItem.mock.calls[0][1]
  expect(storeQueue.length).toBe(1)
  expect(storeQueue[0].resource).toBe('foo')
  expect(storeQueue[0].action).toBe('bar')
  expect(applyMutation).toHaveBeenCalled()
  expect(applyMutation.mock.calls[0][1]).toBe('foo')
  expect(applyMutation.mock.calls[0][2]).toBe('bar')
  expect(applyMutation.mock.calls[0][3]).toEqual([])
})

test('Action gets processed when queue is started', async () => {
  actionQueue.start()
  await nextTick()
  await nextTick()

  expect(executeAction.mock.calls[0][0].resource).toBe('foo')
  expect(setItem).toHaveBeenCalledWith('actionQueue', [])
  expect(commitMutation).toHaveBeenCalled()
  expect(commitMutation.mock.calls[0][1]).toBe('foo')
  expect(commitMutation.mock.calls[0][2]).toBe('bar')
  expect(commitMutation.mock.calls[0][3]).toEqual([])
})
