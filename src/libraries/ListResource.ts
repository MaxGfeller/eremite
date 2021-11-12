import { Queueable } from '..'
import { Resource } from '../Resource'

export interface ListResourceState<T> {
  items: {
    [id: string]: T
  }
  namespaces: {
    [namespaceHash: string]: {
      total: number
      items: T[]
    }
  }
}

export abstract class ListResource<T> extends Resource<ListResourceState<T>> {
  initialState (): ListResourceState<T> {
    return {
      items: {},
      namespaces: {
        default: {
          total: 0,
          items: []
        }
      }
    }
  }

  protected async fetchList (from: number, to: number, namespace: string = 'default'): Promise<{ total?: number, items: T[] }> {
    throw new Error('`fetchList` implementation is missing')
  }

  protected async fetchOne (id: string): Promise<T> {
    throw new Error('`fetchOne` implementation is missing')
  }

  @Queueable()
  async getItem (id: string): Promise<T> {
    const result = await this.fetchOne(id)
    if (!result) {
      throw new Error(`Item \`${id}\` not found`)
    }

    this.state.items[id] = result

    return result
  }

  getItemLocal (id: string): T|null {
    if (this.state.items[id]) {
      return this.state.items[id]
    }

    return null
  }

  @Queueable()
  async getList (from: number, to: number, namespace: string = 'default'): Promise<T[]> {
    const result = await this.fetchList(from, to, namespace)

    if (result.total && result.total !== this.state.namespaces[namespace].total) {
      this.state.namespaces[namespace] = {
        total: result.total,
        items: new Array(result.total).fill(null)
      }
    }

    result.items.forEach((item, index) => {
      this.state.namespaces[namespace].items[from + index] = item
    })

    return this.getListLocal(from, to, namespace)
  }

  getListLocal (from: number, to: number, namespace: string = 'default'): T[] {
    if (!this.state.namespaces[namespace].items) return []

    return this.state.namespaces[namespace].items.slice(from, to)
  }
}
