import PQueue from 'p-queue'
import { v4 as uuid } from 'uuid'
import EventEmitter from 'eventemitter3'
import { debounce } from 'debounce'
import { Ref, ref, unref } from '@vue/reactivity'
import { watch } from '@vue/runtime-core'
import { isTemporaryIdentifier, Mutation, MutationState } from '.'
import { TemporaryIdentifier } from './Resource'

export interface ActionQueueItem {
  actionId?: string
  resource: string
  action: string
  parameters: any[]
  dependingOn?: string
  session?: boolean
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
  protected actionQueue: PQueue
  protected executeAction: (item: ActionQueueItem) => Promise<{ result: any, mutation: Mutation }>
  protected applyMutation: (actionId: string, resource: string, action: string, parameters: any[]) => void
  protected updateMutation: (actionId: string, resource: string, parameters: any[]) => void
  protected commitMutation: (actionId: string, resource: string, action: string, parameters: any[]) => void
  protected cancelMutation: (actionId: string, resource: string) => void
  protected maxTries: number
  protected retryWaitTime: number
  protected temporaryIdentifiers: TemporaryIdentifier[] = []
  protected actionIdPromiseMapping: { [key: string]: Promise<any> } = {}

  protected loadState: null | (() => Promise<ActionQueueItem[]>) = null
  protected persistState: (state: ActionQueueItem[]) => Promise<void>
  protected actionQueueItems: Ref<ActionQueueItem[]> = ref([])

  constructor (opts: {
    loadState: () => Promise<ActionQueueItem[]>
    persistState: (state: ActionQueueItem[]) => Promise<void>
    executeAction: (item: ActionQueueItem) => Promise<{ result: any, mutation: Mutation }>
    applyMutation: (actionId: string, resource: string, action: string, parameters: any[]) => void
    updateMutation: (actionId: string, resource: string, parameters: any[]) => void
    commitMutation: (actionId: string, resource: string, action: string, parameters: any[]) => void
    cancelMutation: (actionId: string, resource: string) => void
    concurrency?: number
    maxTries?: number
    retryWaitTime?: number
  }) {
    super()

    this.persistState = debounce(async (state: ActionQueueItem[]) => {
      await opts.persistState(state)
        .catch((err) => {
          throw new Error(`Failed to persist \`ActionQueue\` state: \`${err.message as string}\``)
        })
    }, 100)

    this.loadState = opts.loadState

    this.loadState()
      .then((items) => {
        this.actionQueueItems.value = items ? items.filter(item => !item.session).concat(this.actionQueueItems.value) : this.actionQueueItems.value
      })
      .catch((err) => {
        throw new Error(`Failed to load \`ActionQueue\` state: ${err.message as string}`)
      })

    this.executeAction = opts.executeAction
    this.applyMutation = opts.applyMutation
    this.updateMutation = opts.updateMutation
    this.commitMutation = opts.commitMutation
    this.cancelMutation = opts.cancelMutation
    this.maxTries = opts.maxTries ?? 3
    this.retryWaitTime = opts.retryWaitTime ?? 1000

    this.actionQueue = new PQueue({ concurrency: opts.concurrency ?? 10, autoStart: false })

    watch(this.actionQueueItems, () => {
      if (this.persistState) {
        // todo: remove JSON parsing
        void this.persistState(JSON.parse(JSON.stringify(unref(this.actionQueueItems))))
      }
    }, { deep: true })
  }

  public start (): void {
    this.actionQueue.start()
  }

  public pause (): void {
    this.actionQueue.pause()
  }

  public getQueue (): ActionQueueItem[] {
    return unref(this.actionQueueItems)
  }

  public async queueAction (queueItem: ActionQueueItem): Promise<any> {
    queueItem.actionId = uuid()
    queueItem.timestamp = Date.now()
    queueItem.maxTries = queueItem.maxTries ?? this.maxTries
    queueItem.timesTried = 0

    this.actionQueueItems.value.push(queueItem)

    this.applyMutation(queueItem.actionId, queueItem.resource, queueItem.action, queueItem.parameters)

    return await this.actionQueue.add(async () => {
      return await this.process(queueItem)
    })
  }

  public async updateQueuedAction (actionId: string, temporaryIdentifiers?: TemporaryIdentifier[]): Promise<void> {
    if (!temporaryIdentifiers) return

    const index = this.actionQueueItems.value.findIndex(item => item.actionId === actionId)
    if (index !== -1) {
      this.actionQueueItems.value[index].temporaryIdentifiers?.push(...temporaryIdentifiers)
    }
  }

  public async cancelAction (actionId: string): Promise<void> {
    const index = this.actionQueueItems.value.findIndex(item => item.actionId === actionId)
    if (index !== -1) {
      const { resource } = this.actionQueueItems.value[index]
      this.actionQueueItems.value.splice(index, 1)
      this.cancelMutation(actionId, resource)
    }

    const dependingOn: string[] = [actionId]
    while (true) {
      const item = this.actionQueueItems.value.find(item => item.dependingOn && !dependingOn.includes(item.dependingOn))
      if (!item) {
        break
      }

      const { resource } = this.actionQueueItems.value[index]
      this.cancelMutation(item.actionId as string, resource)
      dependingOn.push(item.actionId as string)
      this.actionQueueItems.value.splice(this.actionQueueItems.value.findIndex(i => i.actionId === item.actionId, 1))
    }

    this.actionQueue.clear()
    await this.pickup()
  }

  protected processParameters (parameters: any[]): any[] {
    const copyParameters: any[] = JSON.parse(JSON.stringify(parameters))
    const parseParameter = (parameter: any): any => {
      if (!parameter) return parameter

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

          const index = this.actionQueueItems.value.findIndex(item => item.actionId === actionQueueItem.actionId)
          if (index !== -1) {
            this.actionQueueItems.value.splice(index, 1)
          }

          throw err
        } else {
          const index = this.actionQueueItems.value.findIndex(item => item.actionId === actionQueueItem.actionId)
          if (index !== -1) {
            this.actionQueueItems.value[index] = actionQueueItem
          }

          setTimeout(() => {
            void this.process(actionQueueItem)
          }, actionQueueItem.retryWaitTime ?? this.retryWaitTime)

          throw err
        }
      }

      const index = this.actionQueueItems.value.findIndex(item => item.actionId === actionQueueItem.actionId)
      if (index !== -1) {
        this.actionQueueItems.value.splice(index, 1)
      }

      this.actionQueueItems.value = this.actionQueueItems.value.map((actionQueueItem) => {
        actionQueueItem.parameters = this.processParameters(actionQueueItem.parameters)
        return actionQueueItem
      })

      return actionResult.result
    })()

    return await this.actionIdPromiseMapping[actionQueueItem.actionId]
  }

  async pickup (): Promise<void> {
    this.actionQueue.clear()

    this.actionQueueItems.value.forEach((queueItem) => {
      this.applyMutation(queueItem.actionId as string, queueItem.resource, queueItem.action, queueItem.parameters)

      void this.actionQueue.add(async () => {
        return await this.process(queueItem)
      })
    })
  }
}
