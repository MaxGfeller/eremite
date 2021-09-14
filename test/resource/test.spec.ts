import { Resource } from '../../src/Resource'

interface FooType {
  bar: string
}

class Foo extends Resource<FooType> {
  initialState (): FooType {
    return {
      bar: ''
    }
  }
}

const res = new Foo()

test('Setting up a new instance', () => {
  expect(res).toBeTruthy()
})

test('', () => {
  const state = res.getState()
  console.log('state', state)
})
