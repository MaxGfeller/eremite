import * as memoryDriver from 'localforage-driver-memory'
import { Eremite, Resource, Queueable, Mutate, useContext } from '../../src'
import { nextTick, TestConnectionIndicator } from '../utils'

let eremite: Eremite

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
  @Mutate<UserState>(({ state, mutateResourceState }, user: User) => {
    const newUser = { ...user }
    if (!user.id) newUser.unpublished = true
    state.users.push(newUser)

    mutateResourceState('dashboard', (state: DashboardState) => {
      state.users++
    })
  })
  async createUser (user: User): Promise<void> {
    await nextTick()
    const { mutation } = useContext(this)

    mutation?.setParameters({ ...user, id: 2 })
  }
}

interface DashboardState {
  issues: number
  users: number
}

class DashboardResource extends Resource<DashboardState> {
  initialState (): DashboardState {
    return {
      issues: 0,
      users: 0
    }
  }

  async fetchDashboard (): Promise<void> {
    await nextTick()
    this.state.issues = 0
    this.state.users = 0
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
      dashboard: new DashboardResource(),
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

test('Dashboard should also be updated with the new user', async () => {
  const dashboardResource = eremite.getResource('dashboard') as DashboardResource
  const state = dashboardResource.getState()
  expect(state.users).toBe(1)
})

test('Set the connection indicator to online', async () => {
  await testConnectionIndicator.reconnect()
})

test('The user should now be created', async () => {
  await nextTick()
  const state = usersResource.getState()
  expect(state.users).toHaveLength(2)
  expect(state.users[1]).toMatchObject({
    name: 'Johannes',
    email: 'jj@eremite.org',
    id: 2
  })
})

test('Dashboard should still be updated with the new user', async () => {
  const dashboardResource = eremite.getResource('dashboard') as DashboardResource
  const state = dashboardResource.getState()
  expect(state.users).toBe(1)
})
