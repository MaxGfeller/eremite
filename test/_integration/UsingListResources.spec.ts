import { Eremite, ListResource } from '../../src'
import { TestConnectionIndicator, nextTick } from '../utils'

interface Ticket {
  id?: number
  title: string
  text: string
  assignee?: number
}

const tickets: Ticket[] = [{
  id: 1,
  title: 'Ticket 1',
  text: 'This is ticket 1'
}, {
  id: 2,
  title: 'Ticket 2',
  text: 'This is ticket 2'
}, {
  id: 3,
  title: 'Ticket 3',
  text: 'This is ticket 3'
}, {
  id: 4,
  title: 'Ticket 4',
  text: 'This is ticket 4'
}]

class Tickets extends ListResource<Ticket> {
  getId (item: Ticket): string|null {
    if (item.id) return item.id.toString()

    return null
  }

  async fetchList (from: number, to: number, namespace: string = 'default'): Promise<{ total?: number, items: Ticket[] }> {
    await nextTick()
    return {
      total: tickets.length,
      items: tickets.slice(from, to)
    }
  }
}

let eremite: Eremite
const connectionIndicator = new TestConnectionIndicator()

test('Init', () => {
  eremite = new Eremite({
    connectionIndicator,
    resources: {
      tickets: new Tickets()
    }
  })

  expect(eremite).toBeDefined()
})

let resource: Tickets

test('Listing the items initially should be empty', () => {
  resource = eremite.getResource('tickets') as Tickets
  expect(resource).toBeDefined()

  const list = resource.getListLocal(0, 5)
  expect(list).toMatchObject([])
  expect(resource.getListTotal()).toBe(0)
})

test('Fetching the list of items', async () => {
  resource.getList(0, 5)
    .catch((err) => {
      expect(err).toBeUndefined()
    })

  await nextTick()

  expect(resource.getListLocal(0, 5)).toMatchObject([])
  expect(resource.getListTotal()).toBe(0)
})

test('Setting the connection indicator online should fetch the items', async () => {
  connectionIndicator.setOnlineStatus(true)
  await nextTick()

  expect(resource.getListLocal(0, 5)).toMatchObject(tickets)
  expect(resource.getListTotal()).toBe(4)
})
