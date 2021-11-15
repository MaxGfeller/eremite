import EventEmitter from 'eventemitter3'
import { reactive, readonly, Ref, ref, toRaw, unref } from '@vue/reactivity'
import { watch } from '@vue/runtime-core'
import hash from 'object-hash'
import { debounce } from 'debounce'

// todo: symbols for all the property descriptors
export const mutationKey = Symbol('mutateFn')
const mutationContextKey = Symbol('mutation')

export enum MutationState {
  ready,
  cancelled,
  applied,
  committed
}

export interface TemporaryIdentifier {
  label: string
  temporaryId: string
  id: any
}

export class Mutation {
  protected state: MutationState
  protected fn: Function
  protected parameters: any[]
  protected temporaryIdentifiers: TemporaryIdentifier[] = []

  constructor (fn: Function, parameters: any[]) {
    this.fn = fn
    this.parameters = parameters
    this.state = MutationState.ready
  }

  setParameters (...parameters: any[]): void {
    this.parameters = parameters
  }

  getParameters (): any[] {
    return this.parameters
  }

  addTemporaryIdentifier (label: string, temporaryId: string): void {
    this.temporaryIdentifiers.push({ label, temporaryId, id: null })
  }

  getTemporaryIdentifiers (): TemporaryIdentifier[] {
    return this.temporaryIdentifiers
  }

  updateTemporaryIdentifier (label: string, id: any): void {
    const temporaryIdentifier = this.temporaryIdentifiers.find(identifier => identifier.label === label)
    if (temporaryIdentifier) {
      temporaryIdentifier.id = id
    }
  }

  cancel (): void {
    this.state = MutationState.cancelled
  }

  getState (): MutationState {
    return this.state
  }
}

export function useContext (o: Object): { mutation: Mutation | null } {
  // @ts-expect-error
  if (!o[mutationContextKey]) return { mutation: null }

  // @ts-expect-error
  return { mutation: o[mutationContextKey] }
}

interface ResourceEvents<T> {
  'state:update': [T]
  'mutatedState:update': [T]
  'internal:externalMutations:create': [Array<{ id: string, module: string, ts: number, fn: (state: any) => void }>]
  'internal:externalMutations:update': [Array<{ id: string, module: string, ts: number, fn: (state: any) => void }>]
  'internal:externalMutations:commit': [Array<{ id: string, module: string, ts: number, fn: (state: any) => void }>]
  'internal:externalMutations:cancel': [Array<{ id: string }>]
}

export abstract class Resource<T extends Object> extends EventEmitter<ResourceEvents<T>> {
  protected name: string = ''
  protected state: T
  protected mutatedState: Ref<T|null>
  protected pendingMutations: { [id: string]: { ts: number, action: string, parameters: any[] }} = {}
  protected externalMutations: Array<{ id: string, ts: number, handler: (state: T) => void }> = []
  protected mutationsEmittingExternalMutations: { [id: string]: string } = {}
  protected _queueAction: null | ((action: string, parameters: any[]) => Promise<any>) = null
  protected persist: null | ((state: T) => Promise<void>) = null
  protected loadState: null | (() => Promise<T>) = null

  constructor () {
    super()

    // expose state as a reactive object AND emit events, this way the consumer can decide
    this.state = reactive(this.initialState()) as T
    this.mutatedState = ref(null)

    this.computeMutatedState()

    watch(this.state, () => {
      this.computeMutatedState()

      this.emit('state:update', this.getState(false))
      if (this.persist) {
        void this.persist(this.getState(false))
      }
    })

    watch(this.mutatedState, () => {
      this.emit('mutatedState:update', this.getState(true))
    })
  }

  _setName (name: string): void {
    this.name = name
  }

  _setQueueAction (fn: (action: string, parameters: any[]) => Promise<any>): void {
    this._queueAction = fn
  }

  _setLoadState (fn: () => Promise<T>): void {
    this.loadState = fn
    void this.loadState()
      .then(() => {
        this.computeMutatedState()
      })
  }

  _setPersist (fn: (state: T) => Promise<void>): void {
    this.persist = debounce(async (state: T) => {
      await fn(state)
        .catch((err) => {
          throw new Error(`Failed to persist \`${this.name}\` state: \`${err.message as string}\``)
        })
    }, 100)
  }

  private computeMutatedState (): void {
    this.mutationsEmittingExternalMutations = {}

    const newState: T = { ...JSON.parse(JSON.stringify(toRaw(this.state))) }
    const externalStateMutations: Array<{ id: string, ts: number, module: string, fn: (state: any) => void}> = []
    const externalStateMutationUpdates: Array<{ id: string, ts: number, module: string, fn: (state: any) => void}> = []

    const applyMutation = (type: 'internal'|'external', id: string): void => {
      if (type === 'internal') {
        const mutation = this.pendingMutations[id]
        const action: Function = (this as any)[mutation.action]
        const propertyDescriptor = Object.getOwnPropertyDescriptor(action, mutationKey)
        if (!propertyDescriptor) return
        const { fn } = propertyDescriptor.value as { fn: Function }
        let emittedExternalMutation = false
        fn({
          state: newState,
          mutateResourceState: (module: string, fn: (state: any) => void) => {
            if (this.mutationsEmittingExternalMutations[id] === hash(mutation.parameters)) return

            if (this.mutationsEmittingExternalMutations[id]) {
              externalStateMutationUpdates.push({ id, ts: mutation.ts, module, fn })
            } else {
              externalStateMutations.push({ id, ts: mutation.ts, module, fn })
            }
            emittedExternalMutation = true
          }
        }, ...mutation.parameters)

        if (emittedExternalMutation) {
          this.mutationsEmittingExternalMutations[id] = hash(mutation.parameters)
        }
      } else {
        const mutation = this.externalMutations[parseInt(id)]
        mutation.handler(newState)
      }
    }

    const mutations = Object.keys(this.pendingMutations)
      .map(id => ({ type: 'internal', id, ts: this.pendingMutations[id].ts }))
      .concat(this.externalMutations
        .map(({ ts }, index) => ({ type: 'external', id: `${index}`, ts })))
      .sort((a, b) => a.ts - b.ts)

    mutations.forEach(({ type, id }) => applyMutation(type as 'internal' | 'external', id))

    if (externalStateMutations.length) {
      this.emit('internal:externalMutations:create', externalStateMutations)
    }

    if (externalStateMutationUpdates.length) {
      this.emit('internal:externalMutations:update', externalStateMutationUpdates)
    }
    this.mutatedState.value = newState
  }

  addPendingMutations (mutations: Array<{ id: string, ts: number, action: string, parameters: any[] }>): void {
    mutations.forEach(({ id, ts, action, parameters }) => {
      this.pendingMutations[id] = { ts, action, parameters }
    })

    this.computeMutatedState()
  }

  addPendingMutation (id: string, ts: number, action: string, ...parameters: any[]): void {
    this.pendingMutations[id] = { ts, action, parameters }
    this.computeMutatedState()
  }

  cancelPendingMutation (id: string): void {
    const mutation = this.pendingMutations[id]

    if (mutation && Object.keys(this.mutationsEmittingExternalMutations).includes(id)) {
      this.emit('internal:externalMutations:cancel', [{ id }])
    }

    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete this.pendingMutations[id]
    this.computeMutatedState()
  }

  updatePendingMutation (id: string, ...parameters: any[]): void {
    this.pendingMutations[id].parameters = parameters
    this.computeMutatedState()
  }

  commitPendingMutation (id: string, ...parameters: any[]): void {
    const externalStateMutations: Array<{ id: string, ts: number, module: string, fn: (state: any) => void}> = []

    const mutation = this.pendingMutations[id]
    if (!mutation) throw new Error(`No pending mutation with id ${id}`)

    const action: Function = (this as any)[mutation.action]
    const propertyDescriptor = Object.getOwnPropertyDescriptor(action, mutationKey)
    if (!propertyDescriptor) return
    const { fn } = propertyDescriptor.value as { fn: Function }

    fn({
      state: this.state,
      mutateResourceState: (module: string, fn: (state: any) => void) => {
        externalStateMutations.push({ id, ts: mutation.ts, module, fn })
      }
    }, ...parameters)

    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete this.pendingMutations[id]

    this.emit('internal:externalMutations:commit', externalStateMutations)

    this.computeMutatedState()
  }

  addExternalMutations (mutations: Array<{ id: string, ts: number, fn: (state: T) => void }>): void {
    mutations.forEach(({ id, ts, fn }) => {
      this.externalMutations.push({ id, ts, handler: fn })
    })

    this.computeMutatedState()
  }

  updateExternalMutations (mutations: Array<{ id: string, ts: number, fn: (state: T) => void }>): void {
    mutations.forEach((mutation) => {
      this.externalMutations = this.externalMutations.filter(({ id }) => mutation.id !== id)
    })

    mutations.forEach(({ id, ts, fn }) => {
      this.externalMutations.push({ id, ts, handler: fn })
    })

    this.computeMutatedState()
  }

  commitExternalMutations (mutations: Array<{ id: string, ts: number, fn: (state: T) => void }>): void {
    mutations.forEach((mutation) => {
      this.externalMutations = this.externalMutations.filter(({ id }) => mutation.id !== id)
    })

    mutations.forEach(({ fn }) => {
      fn(this.state)
    })

    this.computeMutatedState()
  }

  cancelExternalMutations (ids: string[]): void {
    let deletedMutations = false

    ids.forEach((id) => {
      const mutationsWithId = this.externalMutations.filter(({ id: mutationId }) => mutationId === id)
      if (!mutationsWithId.length) return

      deletedMutations = true
      mutationsWithId.forEach((mutation) => {
        this.externalMutations.splice(this.externalMutations.indexOf(mutation), 1)
      })
    })

    if (!deletedMutations) return
    this.computeMutatedState()
  }

  async _triggerAction (action: string, args: any[]): Promise<{ result: any, mutation: Mutation }> {
    // @ts-expect-error
    const descriptor = Object.getOwnPropertyDescriptor(this[action], mutationKey)

    const mutation = new Mutation(descriptor?.value.fn, args)
    const o = descriptor ? { [mutationContextKey]: mutation } : {}
    Object.setPrototypeOf(o, this)

    // @ts-expect-error
    const result = await Object.getOwnPropertyDescriptor(this[action], 'originalFn')?.value.call(o, ...args)

    return {
      result,
      mutation
    }
  }

  async queueAction (action: string, args: any[]): Promise<any> {
    if (!this._queueAction) throw new Error('_queueAction is not set')

    // todo: set action dependencies, pass pending actions
    // todo: consolidate actions

    return await this._queueAction(action, args)
  }

  getReactiveState (mutated: boolean = true): T {
    if (mutated) return this.mutatedState.value as T
    return readonly(this.state) as T
  }

  getState (mutated: boolean = true): T {
    if (mutated) return JSON.parse(JSON.stringify(unref(this.mutatedState))) as T
    return JSON.parse(JSON.stringify(toRaw(this.state))) as T
  }

  abstract initialState (): T
  async reconcile? (): Promise<T> {
    throw new Error('Not implemented')
  }
}
