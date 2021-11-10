import { Mutate, MutationState, Queueable, Resource, useContext } from '../src'

interface FooType {
  bar: string
  baz: string[]
}

const addBazImpl: jest.Mock = jest.fn()

class Foo extends Resource<FooType> {
  initialState (): FooType {
    return {
      bar: '',
      baz: []
    }
  }

  @Queueable()
  @Mutate<FooType>(({ state }, name: string) => {
    state.baz.push(name)
  })
  async addBaz (name: string): Promise<void> {
    addBazImpl(name)
  }

  @Queueable()
  @Mutate<FooType>(({ state, mutateResourceState }, bar: string) => {
    state.bar = bar
    mutateResourceState('test', (state) => {
      state.test = bar
    })
  })
  setBar (bar: string): void {}

  @Queueable()
  @Mutate<FooType>(({ state }, testParam: number) => {})
  async testContext (testParam: number): Promise<void> {
    const { mutation } = useContext(this)

    if (!mutation) {
      throw new Error('mutation is undefined')
    }
  }

  @Queueable()
  @Mutate<FooType>(({ state }, testParam: number) => {})
  async testContextAndSetParameters (testParam: number): Promise<void> {
    const { mutation } = useContext(this)

    if (!mutation) {
      throw new Error('mutation is undefined')
    }

    mutation.setParameters(6)
  }

  @Queueable()
  @Mutate<FooType>(({ state }, testParam: number) => {})
  async testContextAndCancel (testParam: number): Promise<void> {
    const { mutation } = useContext(this)

    if (!mutation) {
      throw new Error('mutation is undefined')
    }

    mutation.cancel()
  }
}

const res = new Foo()

test('Setting up a new instance', () => {
  expect(res).toBeTruthy()
})

test('Add a pending mutation', () => {
  res.addPendingMutation('01', Date.now(), 'addBaz', 'hello')

  expect(res.getState(false)).toEqual({
    bar: '',
    baz: []
  })

  expect(res.getState()).toEqual({
    bar: '',
    baz: ['hello']
  })
})

test('Cancel pending mutation', () => {
  res.cancelPendingMutation('01')

  expect(res.getState(false)).toEqual({
    bar: '',
    baz: []
  })

  expect(res.getState()).toEqual({
    bar: '',
    baz: []
  })
})

test('Multiple pending actions', () => {
  res.addPendingMutation('02', Date.now(), 'addBaz', 'hello')
  res.addPendingMutation('03', Date.now(), 'addBaz', 'world')

  expect(res.getState(false)).toEqual({
    bar: '',
    baz: []
  })

  expect(res.getState()).toEqual({
    bar: '',
    baz: ['hello', 'world']
  })

  res.cancelPendingMutation('02')
  res.cancelPendingMutation('03')
})

test('Sorting pending mutations by timestamp', () => {
  const ts = Date.now()

  res.addPendingMutation('04', ts, 'addBaz', '04')
  res.addPendingMutation('05', ts - 5, 'addBaz', '05')
  res.addPendingMutation('06', ts + 5, 'addBaz', '06')
  res.addPendingMutation('07', ts - 10, 'addBaz', '07')

  expect(res.getState().baz).toEqual(['07', '05', '04', '06'])

  res.cancelPendingMutation('04')
  res.cancelPendingMutation('05')
  res.cancelPendingMutation('06')
  res.cancelPendingMutation('07')
})

test('Adding external mutations', () => {
  res.addExternalMutations([{
    id: '08',
    ts: Date.now(),
    fn: (state) => {
      state.baz.push('world')
    }
  }])

  expect(res.getState(true)).toEqual({
    bar: '',
    baz: ['world']
  })
})

test('Cancelling external mutations', () => {
  res.cancelExternalMutations(['08'])

  expect(res.getState(true)).toEqual({
    bar: '',
    baz: []
  })
})

test('External mutations stemming from internal mutations are emitted', (done) => {
  res.on('internal:externalMutations:create', (mutations) => {
    expect(mutations.length).toBe(1)
    expect(mutations[0].id).toBe('09')
    expect(mutations[0].module).toBe('test')
    done()
  })

  res.addPendingMutation('09', Date.now(), 'setBar', 'one')
})

test('Cancelling a mutation emits an event to also cancel its external mutations', (done) => {
  res.on('internal:externalMutations:cancel', (mutations) => {
    expect(mutations.length).toBe(1)
    expect(mutations[0].id).toBe('09')
    done()
  })

  res.cancelPendingMutation('09')
})

test('Sorting pending and external mutations', () => {})

test('Calling an action without setting _queueAction first throws an error', (done) => {
  res.addBaz('test')
    .catch((err) => {
      expect(err).toBeTruthy()
      expect(err).toBeInstanceOf(Error)
      done()
    })
})

test('Calling the action queues it', () => {
  const queueFn: jest.Mock = jest.fn(() => {})
  res._setQueueAction(queueFn)

  res.addBaz('test')
    .catch(err => expect(err).toBeFalsy())

  expect(queueFn).toHaveBeenCalledWith('addBaz', ['test'])
})

test('Triggering an action executes it', () => {
  res._triggerAction('addBaz', ['test'])
    .catch(err => expect(err).toBeFalsy())

  expect(addBazImpl).toHaveBeenCalledWith('test')
})

test('Inside an action we have a context with the mutation', async () => {
  const { mutation } = await res._triggerAction('testContext', [1])

  expect(mutation.getParameters()).toEqual([1])
})

test('The parameters of the mutation can be changed in action', async () => {
  const { mutation } = await res._triggerAction('testContextAndSetParameters', [1])

  expect(mutation.getParameters()).toEqual([6])
})

test('A mutation can be cancelled inside the action', async () => {
  const { mutation } = await res._triggerAction('testContextAndCancel', [1])

  expect(mutation.getState()).toEqual(MutationState.cancelled)
})
