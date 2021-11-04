import localforage from 'localforage'
import { EventEmitter } from 'eventemitter3'
import { ConnectionIndicator } from './ConnectionIndicator'
import { ActionQueue, ActionQueueItem } from './ActionQueue'

export type Identifier = string | number | { [key: string]: any }

export interface EremitePlugin {
  setItem?: {
    before?: (key: string, value: any, next: (key: string, value: any) => void) => Promise<void>
    after?: (key: string, value: any, next: (key: string, value: any) => void) => Promise<void>
  }
  getItem?: {
    before?: (key: string, value: any, next: (key: string, value: any) => void) => Promise<any>
    after?: (key: string, value: any, next: (key: string, value: any) => void) => Promise<any>
  }
}

export class Eremite extends EventEmitter {
  #store: LocalForage
  #plugins: EremitePlugin[]
  #actionQueue: ActionQueue

  constructor (opts: {
    name?: string
    connectionIndicator: ConnectionIndicator
    forageDriverDefinition?: LocalForageDriver
    forageDriver?: string
    plugins?: EremitePlugin[]
    offline?: boolean
  }) {
    super()

    this.#plugins = opts.plugins ?? []

    const storeName = opts.name ?? 'eremite'
    const forageOpts: LocalForageOptions = {
      name: storeName,
      storeName: `${storeName}--values`
    }

    this.#store = localforage.createInstance(forageOpts)
    if (opts.forageDriverDefinition) {
      this.#store.defineDriver(opts.forageDriverDefinition)
        .catch((err) => {
          throw new Error(err)
        })
    }

    if (opts.forageDriver) {
      this.#store.setDriver(opts.forageDriver)
        .catch((err) => {
          throw new Error(err)
        })
    }

    this.#actionQueue = new ActionQueue({
      executeAction: async (action: ActionQueueItem) => {
        return null
      },
      getItem: this.getItem,
      setItem: this.setItem,
      applyMutation: () => {},
      commitMutation: () => {},
      cancelMutation: () => {}
    })

    if (!opts.offline ?? true) {
      this.#actionQueue.start()
    }
  }

  protected preparePlugins (action: string, step: string): Function[] {
    return this.#plugins.map((plugin) => {
      // @ts-expect-error
      if (!plugin[action]?.[step]) {
        return null
      }

      // @ts-expect-error
      return plugin[action]?.[step]
    })
      .filter(Boolean)
  }

  protected async setItem (key: string, value: any): Promise<void> {
    const prePlugins = this.preparePlugins('setItem', 'before')

    const processPlugins = async (key: string, value: any, plugins: Function[]): Promise<{key: string, value: any, processFurther: boolean }> => {
      let index = 0
      let processNext = true

      let actualKey = key
      let actualValue = value

      while (processNext && index < plugins.length) {
        processNext = false
        await plugins[index](actualKey, actualValue, (k: string, v: any) => {
          actualKey = k
          actualValue = v
          processNext = true
        })
        index++
      }

      return { key: actualKey, value: actualValue, processFurther: processNext }
    }

    const processedValues = await processPlugins(key, value, prePlugins)

    if (!processedValues.processFurther) {
      return
    }

    await this.#store.setItem(processedValues.key, processedValues.value)

    const postPlugins = this.preparePlugins('setItem', 'after')
    await processPlugins(processedValues.key, processedValues.value, postPlugins)
  }

  protected async getItem (key: string): Promise<any> {
    const prePlugins = this.preparePlugins('getItem', 'before')

    const processPlugins = async (key: string, value: any, isBefore: boolean, plugins: Function[]): Promise<{key: string, value: any, processFurther: boolean }> => {
      let index = 0
      let processNext = true

      let actualKey = key
      let actualValue = value

      while (processNext && index < plugins.length) {
        processNext = false
        const fnResult = await plugins[index](actualKey, actualValue, (k: string, v: any) => {
          actualKey = k
          actualValue = v
          processNext = true
        })
        if (!processNext && fnResult !== undefined) {
          actualValue = fnResult
        }

        index++
      }

      return { key: actualKey, value: actualValue, processFurther: processNext }
    }

    const processedValues = await processPlugins(key, null, true, prePlugins)

    if (!processedValues.processFurther) {
      return processedValues.value
    }

    const result = await this.#store.getItem(processedValues.key)

    const postPlugins = this.preparePlugins('getItem', 'after')
    const processedValuesPost = await processPlugins(processedValues.key, result, false, postPlugins)

    return processedValuesPost.value
  }
}
