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

  protected async fetchOne (id: string, namespace: string = 'default'): Promise<T> {
    throw new Error('`fetchOne` implementation is missing')
  }
}
