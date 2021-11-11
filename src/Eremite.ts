import localforage from 'localforage'
import { EventEmitter } from 'eventemitter3'
import { ConnectionIndicator } from './ConnectionIndicator'
import { ActionQueue, ActionQueueItem } from './ActionQueue'
import { Resource } from '.'

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
  protected name: string
  protected store: LocalForage
  protected plugins: EremitePlugin[]
  protected actionQueue: ActionQueue
  protected resources: { [name: string]: Resource<any> }
  protected connectionIndicator: ConnectionIndicator

  constructor (opts: {
    name?: string
    connectionIndicator: ConnectionIndicator
    forageDriverDefinition?: LocalForageDriver
    forageDriver?: string
    plugins?: EremitePlugin[]
    offline?: boolean
    resources?: { [name: string]: Resource<any> }
  }) {
    super()

    this.name = opts.name ?? 'default'

    this.plugins = opts.plugins ?? []
    this.resources = opts.resources ?? {}
    this.connectionIndicator = opts.connectionIndicator

    Object.values(this.resources).forEach((resource) => {
      const getMutationsByModule = (mutations: Array<{ module: string, id: string, ts?: number, fn?: (state: any) => void }>): { [module: string]: Array<{ id: string, ts?: number, fn?: (state: any) => void }> } => {
        const mutationsByModule: { [module: string]: Array<{ id: string, ts: number, fn: (state: any) => void }> } = {}

        mutations.forEach(({ id, module, ts, fn }) => {
          if (!mutationsByModule[module]) mutationsByModule[module] = []
          mutationsByModule[module].push({ id, ts: ts as number, fn: fn as (state: any) => void })
        })

        return mutationsByModule
      }
      resource.on('internal:externalMutations:create', (mutations) => {
        const mutationsByModule = getMutationsByModule(mutations)

        Object.keys(mutationsByModule).forEach((module) => {
          this.getResource(module).addExternalMutations(mutationsByModule[module] as Array<{ id: string, ts: number, fn: (state: any) => void }>)
        })
      })

      resource.on('internal:externalMutations:update', (mutations) => {
        const mutationsByModule = getMutationsByModule(mutations)

        Object.keys(mutationsByModule).forEach((module) => {
          this.getResource(module).updateExternalMutations(mutationsByModule[module] as Array<{ id: string, ts: number, fn: (state: any) => void }>)
        })
      })

      resource.on('internal:externalMutations:cancel', (mutations) => {
        mutations.forEach((module) => {
          Object.values(this.resources.forEach).forEach((resource) => {
            resource.cancelExternalMutations(mutations)
          })
        })
      })
    })

    const storeName = opts.name ?? 'eremite'
    const forageOpts: LocalForageOptions = {
      name: storeName,
      storeName: `${storeName}--values`
    }

    this.store = localforage.createInstance(forageOpts)
    if (opts.forageDriverDefinition) {
      this.store.defineDriver(opts.forageDriverDefinition)
        .catch((err) => {
          throw new Error(err)
        })
    }

    if (opts.forageDriver) {
      this.store.setDriver(opts.forageDriver)
        .catch((err) => {
          throw new Error(err)
        })
    }

    this.actionQueue = new ActionQueue({
      executeAction: async (action: ActionQueueItem) => {
        const result = await this.getResource(action.resource)._triggerAction(action.action, action.parameters)

        return result
      },
      getItem: async (name: string): Promise<any> => {
        return await this.getItem(name)
      },
      setItem: async (name: string, value: any): Promise<void> => {
        return await this.setItem(name, value)
      },
      applyMutation: (actionId: string, resource: string, action: string, parameters: any[]): void => {
        this.getResource(resource).addPendingMutation(actionId, Date.now(), action, ...parameters)
      },
      updateMutation: (actionId: string, resource: string, parameters: any[]): void => {
        this.getResource(resource).updatePendingMutation(actionId, ...parameters)
      },
      commitMutation: (actionId: string, resource: string, action: string, parameters: any[]): void => {
        this.getResource(resource).commitPendingMutation(actionId, ...parameters)
      },
      cancelMutation: (actionId: string, resource: string): void => {
        this.getResource(resource).cancelPendingMutation(actionId)
      }
    })

    if (!opts.offline ?? true) {
      this.actionQueue.start()
    }
  }

  protected getResource (name: string): Resource<any> {
    const resource = this.resources[name]
    if (!resource) throw new Error(`Resource\`${name}\` not found`)

    return resource
  }

  protected preparePlugins (action: string, step: string): Function[] {
    return this.plugins.map((plugin) => {
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

    await this.store.setItem(processedValues.key, processedValues.value)

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

    const result = await this.store.getItem(processedValues.key)

    const postPlugins = this.preparePlugins('getItem', 'after')
    const processedValuesPost = await processPlugins(processedValues.key, result, false, postPlugins)

    return processedValuesPost.value
  }
}
