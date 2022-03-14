import { Queueable } from '..'
import { Resource } from '../Resource'
import hash from 'object-hash'
import { MaxTries } from '../decorators/MaxTries'

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

export function addToFrontMutation (opts: { state: ListResourceState<any> }, item: any, namespace: string = 'default'): void {
  opts.state.namespaces[namespace].items.unshift(item)
  opts.state.namespaces[namespace].total++
}

export function addToBackMutation (opts: { state: ListResourceState<any> }, item: any, namespace: string = 'default'): void {
  opts.state.namespaces[namespace].items.push(item)
  opts.state.namespaces[namespace].total++
}

export abstract class ListResource<T> extends Resource<ListResourceState<T>> {
  protected maxPageSize: number|null = null

  constructor (opts: { maxPageSize?: number } = {}) {
    super()

    this.maxPageSize = opts.maxPageSize ?? null
  }

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

  abstract getId (item: T): string|null

  protected hashObject (obj: any): string {
    return hash(obj)
  }

  protected async fetchList (from: number, to: number, namespace: string = 'default'): Promise<{ total?: number, items: T[] }> {
    throw new Error('`fetchList` implementation is missing')
  }

  protected async fetchOne (id: string): Promise<T> {
    throw new Error('`fetchOne` implementation is missing')
  }

  @MaxTries({ tries: 1 })
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

  @MaxTries({ tries: 1 })
  @Queueable()
  async getList (from: number, to: number, namespace: string = 'default'): Promise<T[]> {
    let result: { total?: number, items: T[]}

    if (this.maxPageSize && (to - from) > this.maxPageSize) {
      const promises = []
      for (let i = 0; i < Math.ceil((to - from) / this.maxPageSize); i++) {
        promises.push(this.fetchList(from + (i * this.maxPageSize), from + (i * this.maxPageSize) + this.maxPageSize - 1, namespace))
      }

      const results = await Promise.all(promises)
      const resultList: T[] = []
      result = {
        total: results[0].total ?? undefined,
        items: results.reduce((acc, cur) => {
          acc.push(...cur.items)
          return acc
        }, resultList)
      }
    } else {
      result = await this.fetchList(from, to, namespace)
    }

    if (result.total && result.total !== this.state.namespaces[namespace]?.total) {
      this.state.namespaces[namespace] = {
        total: result.total,
        items: new Array(result.total).fill(null)
      }
    }

    result.items.forEach((item, index) => {
      this.state.namespaces[namespace].items[from + index] = item
      const id = this.getId(item)
      if (id && this.state.items[id]) {
        this.state.items[id] = { ...this.state.items[id], ...item }
      }
    })

    return this.getListLocal(from, to, namespace)
  }

  getListLocal (from: number, to: number, namespace: string = 'default'): T[] {
    if (!this.state.namespaces[namespace].items) return []

    return this.state.namespaces[namespace].items
      .slice(from, to)
      .map((item) => {
        if (!this.getId(item)) return item

        const detailedItem = this.state.items[this.getId(item) as string]
        if (!detailedItem) return item

        return { ...item, ...detailedItem }
      })
  }

  getListTotal (namespace: string = 'default'): number {
    return this.state.namespaces[namespace]?.total ?? 0
  }
}
