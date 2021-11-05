import PQueue from 'p-queue'
import { v4 as uuid } from 'uuid'
import EventEmitter from 'eventemitter3'
import { Mutation, MutationState } from '.'

export interface TemporaryIdentifier {
  temporaryId: string
  id?: any
}

export interface ActionQueueItem {
  actionId?: string
  resource: string
  action: string
  parameters: any[]
  dependingOn?: string
  timesTried?: number
  lastError?: string
  temporaryIdentifiers?: TemporaryIdentifier[]
  timestamp?: number
}

export class ActionQueue extends EventEmitter {
  protected storeQueue: PQueue
  protected actionQueue: PQueue
  protected executeAction: (item: ActionQueueItem) => Promise<{ result: any, mutation: Mutation }>
  protected getItem: (name: string) => Promise<any>
  protected setItem: (name: string, value: any) => Promise<void>
  protected applyMutation: (actionId: string, resource: string, action: string, parameters: any[]) => void
  protected commitMutation: (actionId: string, resource: string, action: string, parameters: any[]) => void
  protected cancelMutation: (actionId: string, resource: string) => void
  // #tmpIdMapping: { [key: string]: Identifier } = {}
  #actionIdPromiseMapping: { [key: string]: Promise<any> } = {}

  constructor (opts: {
    executeAction: (item: ActionQueueItem) => Promise<{ result: any, mutation: Mutation }>
    getItem: (name: string) => Promise<any>
    setItem: (name: string, value: any) => Promise<void>
    applyMutation: (actionId: string, resource: string, action: string, parameters: any[]) => void
    commitMutation: (actionId: string, resource: string, action: string, parameters: any[]) => void
    cancelMutation: (actionId: string, resource: string) => void
    concurrency?: number
  }) {
    super()

    this.executeAction = opts.executeAction
    this.getItem = opts.getItem
    this.setItem = opts.setItem
    this.applyMutation = opts.applyMutation
    this.commitMutation = opts.commitMutation
    this.cancelMutation = opts.cancelMutation

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

  protected async process (actionQueueItem: ActionQueueItem): Promise<any> {
    if (!actionQueueItem.actionId) {
      throw new Error('actionQueueItem.actionId is not set')
    }

    if (actionQueueItem.dependingOn) {
      await this.#actionIdPromiseMapping[actionQueueItem.dependingOn]
    }

    this.#actionIdPromiseMapping[actionQueueItem.actionId] = (async () => {
      let actionResult
      try {
        actionResult = await this.executeAction(actionQueueItem)
        if (actionResult.mutation.getState() === MutationState.cancelled) {
          this.cancelMutation(actionQueueItem.actionId as string, actionQueueItem.resource)
        } else {
          this.commitMutation(actionQueueItem.actionId as string, actionQueueItem.resource, actionQueueItem.action, actionResult.mutation.getParameters())
        }

        actionResult.mutation.getTemporaryIdentifiers().forEach((temporaryIdentifier) => {
          if (!temporaryIdentifier.id) return

          // todo: go through action queue and update all temporary ids
          return true
        })
      } catch (err) {
        // todo: re-implement fail
        // this.fail(item.actionId, err)
        console.error(err)
        throw err
      }

      await this.storeQueue.add(async () => {
        const queue: ActionQueueItem[] = (await this.getItem('actionQueue')) || []
        const index = queue.findIndex(item => item.actionId === actionQueueItem.actionId)
        if (index !== -1) {
          queue.splice(index, 1)
        }

        await this.setItem('actionQueue', queue)
      })

      return actionResult.result
    })()

    return await this.#actionIdPromiseMapping[actionQueueItem.actionId]
  }
}
