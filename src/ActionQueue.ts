import PQueue from 'p-queue'
import { v4 as uuid } from 'uuid'
import EventEmitter from 'eventemitter3'
import { isTemporaryIdentifier, Mutation, MutationState } from '.'
import { TemporaryIdentifier } from './Resource'

export interface ActionQueueItem {
  actionId?: string
  resource: string
  action: string
  parameters: any[]
  dependingOn?: string
  timesTried?: number
  maxTries?: number
  retryWaitTime?: number
  lastError?: string
  temporaryIdentifiers?: TemporaryIdentifier[]
  timestamp?: number
}

interface ActionQueueEvents {
  'error': [Error, ActionQueueItem]
}

export class ActionQueue extends EventEmitter<ActionQueueEvents> {
  protected storeQueue: PQueue
  protected actionQueue: PQueue
  protected executeAction: (item: ActionQueueItem) => Promise<{ result: any, mutation: Mutation }>
  protected getItem: (name: string) => Promise<any>
  protected setItem: (name: string, value: any) => Promise<void>
  protected applyMutation: (actionId: string, resource: string, action: string, parameters: any[]) => void
  protected updateMutation: (actionId: string, resource: string, parameters: any[]) => void
  protected commitMutation: (actionId: string, resource: string, action: string, parameters: any[]) => void
  protected cancelMutation: (actionId: string, resource: string) => void
  protected maxTries: number
  protected retryWaitTime: number

  protected temporaryIdentifiers: TemporaryIdentifier[] = []
  protected actionIdPromiseMapping: { [key: string]: Promise<any> } = {}

  constructor (opts: {
    executeAction: (item: ActionQueueItem) => Promise<{ result: any, mutation: Mutation }>
    getItem: (name: string) => Promise<any>
    setItem: (name: string, value: any) => Promise<void>
    applyMutation: (actionId: string, resource: string, action: string, parameters: any[]) => void
    updateMutation: (actionId: string, resource: string, parameters: any[]) => void
    commitMutation: (actionId: string, resource: string, action: string, parameters: any[]) => void
    cancelMutation: (actionId: string, resource: string) => void
    concurrency?: number
    maxTries?: number
    retryWaitTime?: number
  }) {
    super()

    this.executeAction = opts.executeAction
    this.getItem = opts.getItem
    this.setItem = opts.setItem
    this.applyMutation = opts.applyMutation
    this.updateMutation = opts.updateMutation
    this.commitMutation = opts.commitMutation
    this.cancelMutation = opts.cancelMutation
    this.maxTries = opts.maxTries ?? 3
    this.retryWaitTime = opts.retryWaitTime ?? 1000

    this.storeQueue = new PQueue({ concurrency: 1, autoStart: true })
    this.actionQueue = new PQueue({ concurrency: opts.concurrency ?? 10, autoStart: false })
  }

  public start (): void {
    this.actionQueue.start()
  }

  public pause (): void {
    this.actionQueue.pause()
  }

  public async queueAction (queueItem: ActionQueueItem): Promise<any> {
    queueItem.actionId = uuid()
    queueItem.timestamp = Date.now()
    queueItem.maxTries = queueItem.maxTries ?? this.maxTries
    queueItem.timesTried = 0

    await this.storeQueue.add(async () => {
      const queue: ActionQueueItem[] = (await this.getItem('actionQueue')) || []
      queue.push(queueItem)
      await this.setItem('actionQueue', queue)
    })

    this.applyMutation(queueItem.actionId, queueItem.resource, queueItem.action, queueItem.parameters)

    return await this.actionQueue.add(async () => {
      return await this.process(queueItem)
    })
  }

  public async cancelAction (actionId: string): Promise<void> {
    await this.storeQueue.add(async () => {
      const queue: ActionQueueItem[] = (await this.getItem('actionQueue')) || []
      const index = queue.findIndex(item => item.actionId === actionId)
      if (index !== -1) {
        const { resource } = queue[index]
        queue.splice(index, 1)
        this.cancelMutation(actionId, resource)
      }

      const dependingOn: string[] = [actionId]
      while (true) {
        const item = queue.find(item => item.dependingOn && !dependingOn.includes(item.dependingOn))
        if (!item) {
          break
        }

        const { resource } = queue[index]
        this.cancelMutation(item.actionId as string, resource)
        dependingOn.push(item.actionId as string)
        queue.splice(queue.findIndex(i => i.actionId === item.actionId, 1))
      }

      await this.setItem('actionQueue', queue)
    })
  }

  protected processParameters (parameters: any[]): any[] {
    const copyParameters: any[] = JSON.parse(JSON.stringify(parameters))
    const parseParameter = (parameter: any): any => {
      if (typeof parameter === 'string' && isTemporaryIdentifier(parameter)) {
        const tmpId = this.temporaryIdentifiers.find(tmp => tmp.temporaryId === parameter)
        if (tmpId?.id) return tmpId.id
        return parameter
      }

      if (typeof parameter === 'object' && !Array.isArray(parameter)) {
        Object.keys(parameter).forEach((key) => {
          parameter[key] = parseParameter(parameter[key])
        })
      } else if (Array.isArray(parameter)) {
        parameter.forEach((param, index) => {
          parameter[index] = parseParameter(param)
        })
      }

      return parameter
    }

    return copyParameters.map(parameter => parseParameter(parameter))
  }

  protected async process (actionQueueItem: ActionQueueItem): Promise<any> {
    if (!actionQueueItem.actionId) {
      throw new Error('actionQueueItem.actionId is not set')
    }

    if (actionQueueItem.dependingOn) {
      await this.actionIdPromiseMapping[actionQueueItem.dependingOn]
    }

    this.actionIdPromiseMapping[actionQueueItem.actionId] = (async () => {
      let actionResult
      try {
        actionResult = await this.executeAction({ ...actionQueueItem, parameters: this.processParameters(actionQueueItem.parameters) })
        if (actionResult.mutation.getState() === MutationState.cancelled) {
          this.cancelMutation(actionQueueItem.actionId as string, actionQueueItem.resource)
        } else {
          this.commitMutation(actionQueueItem.actionId as string, actionQueueItem.resource, actionQueueItem.action, actionResult.mutation.getParameters())
        }

        const temporaryIdentifiers = actionResult.mutation.getTemporaryIdentifiers()
        this.temporaryIdentifiers.push(...temporaryIdentifiers)
      } catch (err) {
        if (!actionQueueItem.timesTried) actionQueueItem.timesTried = 0
        actionQueueItem.timesTried++
        actionQueueItem.lastError = (err as Error).message

        if (actionQueueItem.timesTried >= (actionQueueItem.maxTries ?? this.maxTries)) {
          this.cancelMutation(actionQueueItem.actionId as string, actionQueueItem.resource)
          this.emit('error', err as Error, actionQueueItem)

          await this.storeQueue.add(async () => {
            const queue: ActionQueueItem[] = (await this.getItem('actionQueue')) || []
            const index = queue.findIndex(item => item.actionId === actionQueueItem.actionId)
            if (index !== -1) {
              queue.splice(index, 1)
              await this.setItem('actionQueue', queue)
            }
          })

          throw err
        } else {
          await this.storeQueue.add(async () => {
            const queue: ActionQueueItem[] = (await this.getItem('actionQueue')) || []
            const index = queue.findIndex(item => item.actionId === actionQueueItem.actionId)
            if (index !== -1) {
              queue[index] = actionQueueItem
              await this.setItem('actionQueue', queue)
            }
          })

          setTimeout(() => {
            void this.process(actionQueueItem)
          }, actionQueueItem.retryWaitTime ?? this.retryWaitTime)

          throw err
        }
      }

      await this.storeQueue.add(async () => {
        let queue: ActionQueueItem[] = (await this.getItem('actionQueue')) || []
        const index = queue.findIndex(item => item.actionId === actionQueueItem.actionId)
        if (index !== -1) {
          queue.splice(index, 1)
        }

        queue = queue.map((actionQueueItem) => {
          actionQueueItem.parameters = this.processParameters(actionQueueItem.parameters)
          return actionQueueItem
        })

        await this.setItem('actionQueue', queue)
      })

      return actionResult.result
    })()

    return await this.actionIdPromiseMapping[actionQueueItem.actionId]
  }
}
