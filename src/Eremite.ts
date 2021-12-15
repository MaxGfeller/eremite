import localforage from 'localforage'
import { EventEmitter } from 'eventemitter3'
import { ConnectionIndicator } from './ConnectionIndicator'
import { ActionQueue, ActionQueueItem } from './ActionQueue'
import { Resource } from '.'
import { TemporaryIdentifier } from './Resource'

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

interface EremiteEvents {
  'connection': [boolean]
}
export class Eremite extends EventEmitter<EremiteEvents> {
  protected name: string
  protected store: LocalForage
  protected plugins: EremitePlugin[]
  protected actionQueue: ActionQueue
  protected resources: { [name: string]: Resource<any> }
  protected connectionIndicator: ConnectionIndicator
  protected disconnected: boolean = false

  constructor (opts: {
    name?: string
    connectionIndicator: ConnectionIndicator
    forageDriverDefinition?: LocalForageDriver
    forageDriver?: string
    plugins?: EremitePlugin[]
    offline?: boolean
    resources?: { [name: string]: Resource<any> }
    actionQueueConcurrency?: number
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

      resource.on('internal:externalMutations:commit', (mutations) => {
        const mutationsByModule = getMutationsByModule(mutations)

        Object.keys(mutationsByModule).forEach((module) => {
          this.getResource(module).commitExternalMutations(mutationsByModule[module] as Array<{ id: string, ts: number, fn: (state: any) => void }>)
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
      concurrency: opts.actionQueueConcurrency,
      executeAction: async (action: ActionQueueItem) => {
        const result = await this.getResource(action.resource)._triggerAction(action.action, action.parameters, { temporaryIdentifiers: action.temporaryIdentifiers })

        return result
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
      },
      persistState: async (state: any): Promise<void> => {
        await this.setItem('actionQueue', state)
      },
      loadState: async (): Promise<any> => {
        const state = (await this.getItem('actionQueue')) ?? null
        return state
      }
    })

    new Promise<void>((resolve) => {
      let loaded = 0

      Object.keys(this.resources).forEach((resourceName) => {
        const resource = this.resources[resourceName]
        resource.once('state:loaded', () => {
          loaded++

          if (loaded === Object.keys(this.resources).length) {
            resolve()
          }
        })

        resource._setName(resourceName)
        resource._setPersist(async (state: any): Promise<void> => {
          await this.setItem(`${resourceName}_state`, state)
        })
        resource._setLoadState(async (): Promise<any> => {
          const state = (await this.getItem(`${resourceName}_state`)) ?? null
          return state
        })
        resource._setQueueAction(async (action: string, parameters: any[], opts: {
          maxTries?: number
          retryWaitTime?: number
        } = {}): Promise<any> => {
          return await this.actionQueue.queueAction({
            resource: resourceName,
            action: action,
            parameters,
            ...opts
          })
        })
        resource._setUpdateQueuedAction(async (actionId: string, temporaryIdentifiers?: TemporaryIdentifier[]): Promise<void> => {
          await this.actionQueue.updateQueuedAction(actionId, temporaryIdentifiers)
        })
      })
    })
      .then(() => {
        void this.actionQueue.pickup()
      })
      .catch((err) => {
        throw err
      })

    if (!opts.offline ?? true) {
      if (this.connectionIndicator.isConnected()) {
        this.actionQueue.start()
      }
    }

    if (opts.offline) this.disconnected = true

    this.connectionIndicator.on('connection', (connected) => {
      if (this.disconnected) return

      if (connected) {
        this.actionQueue.start()
        this.emit('connection', true)
      } else {
        this.actionQueue.pause()
        this.emit('connection', false)
      }
    })
  }

  public disconnect (): void {
    this.disconnected = true
    this.actionQueue.pause()
    this.emit('connection', false)
  }

  public reconnect (): void {
    this.disconnected = false
    if (this.connectionIndicator.isConnected()) {
      this.emit('connection', true)
      this.actionQueue.start()
    }
  }

  public getActionQueue (): ActionQueue {
    return this.actionQueue
  }

  public getResource (name: string): Resource<any> {
    const resource = this.resources[name]
    if (!resource) throw new Error(`Resource\`${name}\` not found`)

    return resource
  }

  public getConnectionIndicator (): ConnectionIndicator {
    return this.connectionIndicator
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

  _getSetItem (): (key: string, value: any) => Promise<void> {
    return this.setItem.bind(this)
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

  _getGetItem (): (key: string) => Promise<any> {
    return this.getItem.bind(this)
  }
}
