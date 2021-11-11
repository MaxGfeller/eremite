import EventEmitter from 'eventemitter3'
import * as memoryDriver from 'localforage-driver-memory'
import { Eremite, Resource, Queueable, Mutate, ConnectionIndicator, ConnectionIndicatorEvents, useContext } from '../../src'
import { nextTick, sleep } from '../utils'

let eremite: Eremite

class TestConnectionIndicator extends EventEmitter<ConnectionIndicatorEvents> implements ConnectionIndicator {
  protected onlineStatus: boolean = false

  setOnlineStatus (status: boolean): void {
    this.onlineStatus = status
    this.emit('connection', status)
  }

  isConnected (): boolean {
    return this.onlineStatus
  }

  disconnect (): void {
    this.setOnlineStatus(false)
  }

  async reconnect (): Promise<void> {
    await nextTick()
    this.setOnlineStatus(true)
  }
}

interface User {
  id?: number
  unpublished?: boolean
  name: string
  email: string
}

interface UserState {
  users: User[]
}

const users: User[] = [{
  id: 1,
  name: 'Max',
  email: 'mg@eremite.org'
}]

class UserResource extends Resource<UserState> {
  initialState (): UserState {
    return {
      users: []
    }
  }

  async fetchUsers (): Promise<void> {
    await nextTick()
    this.state.users = users
  }

  @Queueable()
  @Mutate<UserState>(({ state }, user: User) => {
    console.log('mutate', user)

    const newUser = { ...user }
    if (!user.id) newUser.unpublished = true
    state.users.push(newUser)
  })
  async createUser (user: User): Promise<void> {
    await nextTick()
    const { mutation } = useContext(this)

    mutation?.setParameters({ ...user, id: 2 })
  }
}

const testConnectionIndicator = new TestConnectionIndicator()

test('Initialize', () => {
  eremite = new Eremite({
    connectionIndicator: testConnectionIndicator,
    plugins: [],
    forageDriverDefinition: memoryDriver,
    forageDriver: memoryDriver._driver,
    resources: {
      users: new UserResource()
    }
  })

  expect(eremite).toBeDefined()
})

let usersResource: UserResource
test('List users', async () => {
  usersResource = eremite.getResource('users') as UserResource
  expect(usersResource).toBeDefined()

  const state = usersResource.getState()
  expect(state.users).toHaveLength(0)

  await usersResource.fetchUsers()
  const newState = usersResource.getState()
  expect(newState.users).toHaveLength(1)
  expect(newState.users[0]).toMatchObject(users[0])
})

test('Create new user', async () => {
  const state = usersResource.getState()
  expect(state.users).toHaveLength(1)

  usersResource.createUser({
    name: 'Johannes',
    email: 'jj@eremite.org'
  })
    .catch((err) => {
      expect(err).toBeUndefined()
    })
  await nextTick()
})

test('User should now be listed as unpublished', async () => {
  const state = usersResource.getState()
  expect(state.users).toHaveLength(2)
  expect(state.users[1]).toMatchObject({
    name: 'Johannes',
    email: 'jj@eremite.org',
    unpublished: true
  })
})

test('Set the connection indicator to online', async () => {
  await testConnectionIndicator.reconnect()
})

test('The user should now be created', async () => {
  await sleep(100)
  const state = usersResource.getState()
  expect(state.users).toHaveLength(2)
  expect(state.users[1]).toMatchObject({
    name: 'Johannes',
    email: 'jj@eremite.org'
  })

  console.log(state)
})
