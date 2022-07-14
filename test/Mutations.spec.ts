import { Resource, Queueable, Mutate } from '../src'

interface MyResourceState {
  stringProp: string
  numberProp: number
  listProp: string[]
}

class MyResource extends Resource<MyResourceState> {
  initialState(): MyResourceState {
    return {
      stringProp: '',
      numberProp: 0,
      listProp: [],
    }
  }

  @Queueable()
  @Mutate<MyResourceState>(({ state }, stringProp) => {
    state.stringProp = stringProp
  })
  updateStringProp (stringProp: string) {
    this.state.stringProp = stringProp
  }

  @Queueable()
  @Mutate<MyResourceState>(({ state }, numberProp) => {
    state.numberProp = numberProp
  })
  updateNumberProp (numberProp: number) {
    this.state.numberProp = numberProp
  }

  @Queueable()
  @Mutate<MyResourceState>(({ state }, stringProp) => {
    state.listProp.push(stringProp)
  })
  addToListProp (listProp: string) {
    this.state.listProp.push(listProp)
  }

  directlyAddToListProp (listProp: string) {
    this.state.listProp.push(listProp)
  }
}


let myResource: MyResource

test('Create resource', async () => {
  myResource = new MyResource()
  expect(myResource).toBeTruthy()
})

test('Mutate string prop', async () => {
  myResource.addPendingMutation('01', Date.now(), 'updateStringProp', 'foo')

  const state = myResource.getState()
  expect(state.stringProp).toEqual('foo')
})

test('Mutate number prop', async () => {
  myResource.addPendingMutation('02', Date.now() + 1, 'updateNumberProp', 5)
  const state = myResource.getState()
  expect(state).toEqual({
    stringProp: 'foo',
    numberProp: 5,
    listProp: [],
  })
})

test('Mutate list prop', async () => {
  myResource.addPendingMutation('03', Date.now() + 2, 'addToListProp', 'hello')
  const state = myResource.getState()
  expect(state).toEqual({
    stringProp: 'foo',
    numberProp: 5,
    listProp: ['hello'],
  })
})

test('Cancel a mutation', async () => {
  myResource.cancelPendingMutation('03')
  const state = myResource.getState()
  expect(state).toEqual({
    stringProp: 'foo',
    numberProp: 5,
    listProp: [],
  })
})

test('Add an external mutation', async () => {
  myResource.addExternalMutations([{
    id: '04',
    ts: Date.now() + 3,
    fn (state) {
      (state as MyResourceState).stringProp = 'bar'
    }
  }])
  const state = myResource.getState()
  expect(state).toEqual({
    stringProp: 'bar',
    numberProp: 5,
    listProp: [],
  })
})

test('Add another string mutation', async () => {
  myResource.addPendingMutation('06', Date.now() + 4, 'updateStringProp', 'baz')

  await sleep(0)
  const state = myResource.getState()
  expect(state).toEqual({
    stringProp: 'baz',
    numberProp: 5,
    listProp: [],
  })
})

test('Add to list', async () => {
  myResource.addPendingMutation('03', Date.now() + 5, 'addToListProp', 'hello')
  const state = myResource.getState()
  expect(state.listProp).toEqual(['hello'])
})

test('Actually add to list', async () => {
  myResource.directlyAddToListProp('first')

  await sleep(0)
  const state = myResource.getState()
  expect(state).toEqual({
    stringProp: 'baz',
    numberProp: 5,
    listProp: [ 'first', 'hello' ]
  })
})

function sleep (ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
