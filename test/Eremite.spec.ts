import * as memoryDriver from 'localforage-driver-memory'
import { BrowserConnectionIndicator } from '../src'
import { Eremite, EremitePlugin } from '../src/Eremite'

jest.mock('../src/ActionQueue.ts')

let eremite: Eremite
let getItem: Function
let setItem: Function

test('Init', () => {
  eremite = new Eremite({
    connectionIndicator: new BrowserConnectionIndicator(),
    plugins: [],
    forageDriverDefinition: memoryDriver,
    forageDriver: memoryDriver._driver
  })
  expect(eremite).toBeDefined()

  getItem = eremite._getGetItem()
  setItem = eremite._getSetItem()

  expect(getItem).toBeDefined()
  expect(setItem).toBeDefined()
})

test('get and set items', async () => {
  const result = await getItem.call(eremite, 'foo')
  expect(result).toBeNull()
  await setItem.call(eremite, 'foo', 'bar')
  const secondResult = await getItem.call(eremite, 'foo')
  expect(secondResult).toBe('bar')
})

let eremiteWithPlugins: Eremite
const beforeGetItem: jest.Mock = jest.fn()
const afterGetItem: jest.Mock = jest.fn()
const beforeSetItem: jest.Mock = jest.fn()
const afterSetItem: jest.Mock = jest.fn()

let pluginsGetItem: Function
let pluginsSetItem: Function

const testPlugin = function (): EremitePlugin {
  return {
    getItem: {
      before: beforeGetItem,
      after: afterGetItem
    },
    setItem: {
      before: beforeSetItem,
      after: afterSetItem
    }
  }
}

test('Initializing with plugins', () => {
  beforeGetItem.mockImplementation(async (key: string, value: any, next: (key: string) => void) => {
    next(key)
  })

  afterGetItem.mockImplementation(async (key: string, value: any, next) => {
    next(key, value)
  })

  beforeSetItem.mockImplementation(async (key: string, value: any, next: (key: string, value: any) => void) => {
    next(key, value)
  })

  afterSetItem.mockImplementation(async (key: string, value: any, next) => {
    next(key, value)
  })

  eremiteWithPlugins = new Eremite({
    name: 'WithPlugins',
    connectionIndicator: new BrowserConnectionIndicator(),
    plugins: [testPlugin()]
  })

  expect(eremiteWithPlugins).toBeDefined()

  pluginsGetItem = eremiteWithPlugins._getGetItem()
  pluginsSetItem = eremiteWithPlugins._getSetItem()

  expect(pluginsGetItem).toBeDefined()
  expect(pluginsSetItem).toBeDefined()
})

test('A setItem.before plugin that does not call next does not save the value', async () => {
  beforeSetItem.mockImplementationOnce(async (key: string, value: any, next: (key: string, value: any) => void) => {})

  await pluginsSetItem.call(eremiteWithPlugins, 'foo', 'bar')
  const result = await pluginsGetItem.call(eremiteWithPlugins, 'foo')
  expect(result).toBeNull()
})

test('A setItem.before that does call next functions as expected', async () => {
  beforeSetItem.mockImplementationOnce(async (key: string, value: any, next: (key: string, value: any) => void) => {
    next(key, value)
  })

  beforeGetItem.mockImplementationOnce(async (key: string, value: any, next: (key: string) => void) => {
    next(key)
  })

  await pluginsSetItem.call(eremiteWithPlugins, 'foo', 'bar')
  const result = await pluginsGetItem.call(eremiteWithPlugins, 'foo')
  expect(result).toBe('bar')
})

test('setItem.before can manipulate the value', async () => {
  beforeSetItem.mockImplementationOnce(async (key: string, value: any, next: (key: string, value: any) => void) => {
    next(key, value as string + '-test')
  })

  beforeGetItem.mockImplementationOnce(async (key: string, value: any, next: (key: string) => void) => {
    next(key)
  })

  await pluginsSetItem.call(eremiteWithPlugins, 'foo', 'bar')
  const result = await pluginsGetItem.call(eremiteWithPlugins, 'foo')
  expect(result).toBe('bar-test')
})

test('...and also the key', async () => {
  beforeSetItem.mockImplementationOnce(async (key: string, value: any, next: (key: string, value: any) => void) => {
    next(key + '1', value)
  })

  beforeGetItem.mockImplementationOnce(async (key: string, value: any, next: (key: string) => void) => {
    next(key)
  })

  await pluginsSetItem.call(eremiteWithPlugins, 'foo', 'bar')
  const result = await pluginsGetItem.call(eremiteWithPlugins, 'foo1')
  expect(result).toBe('bar')
})

test('A getItem.before can return early', async () => {
  beforeSetItem.mockImplementationOnce(async (key: string, value: any, next: (key: string, value: any) => void) => {
    next(key, value)
  })

  beforeGetItem.mockImplementationOnce(async (key: string, value: any, next: (key: string, value: any) => void) => {
    return 'hello'
  })

  await pluginsSetItem.call(eremiteWithPlugins, 'foo', 'bar')
  const result = await pluginsGetItem.call(eremiteWithPlugins, 'foo')
  expect(result).toBe('hello')
})

test('getItem.before can manipulate the key', async () => {
  beforeSetItem.mockImplementationOnce(async (key: string, value: any, next: (key: string, value: any) => void) => {
    next(key, value)
  })

  beforeGetItem.mockImplementationOnce(async (key: string, value: any, next: (key: string, value: any) => void) => {
    next(key + '1', value)
  })

  await pluginsSetItem.call(eremiteWithPlugins, 'foo1', 'bar')
  const result = await pluginsGetItem.call(eremiteWithPlugins, 'foo')
  expect(result).toBe('bar')
})

test('getItem.after is executed but cannot change how the value is saved', async () => {
  afterGetItem.mockImplementationOnce(async (key: string, value: any, next: (key: string, value: any) => void) => {
    expect(key).toBe('foo')
    next(key + '1', value)
  })

  await pluginsSetItem.call(eremiteWithPlugins, 'foo', 'bar')
  const result = await pluginsGetItem.call(eremiteWithPlugins, 'foo')
  expect(result).toBe('bar')
})
