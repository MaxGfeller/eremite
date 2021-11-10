import EventEmitter from 'eventemitter3'
import { reactive, readonly, Ref, ref, toRaw, unref } from '@vue/reactivity'
import { watch } from '@vue/runtime-core'
import hash from 'object-hash'

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
  'internal:externalMutations:create': [Array<{ id: string, module: string, ts: number, fn: Function }>]
  'internal:externalMutations:update': [Array<{ id: string, module: string, ts: number, fn: Function }>]
  'internal:externalMutations:cancel': [[string]]
}

export abstract class Resource<T extends Object> extends EventEmitter<ResourceEvents<T>> {
  protected state: T
  protected mutatedState: Ref<T|null>
  protected pendingMutations: { [id: string]: { ts: number, action: string, parameters: any[] }} = {}
  protected externalMutations: { [id: string]: { ts: number, handler: (state: T) => void } } = {}
  protected mutationsEmittingExternalMutations: { [id: string]: string } = {}
  protected _queueAction: null | ((action: string, parameters: any[]) => Promise<any>) = null

  constructor () {
    super()

    // expose state as a reactive object AND emit events, this way the consumer can decide
    this.state = reactive(this.initialState()) as T
    this.mutatedState = ref(null)

    this.computeMutatedState()

    watch(this.state, () => {
      this.computeMutatedState()

      // todo: persist
      this.emit('state:update', this.getState(false))
    })

    watch(this.mutatedState, () => {
      this.emit('mutatedState:update', this.getState(true))
    })
  }

  _setQueueAction (fn: (action: string, parameters: any[]) => Promise<any>): void {
    this._queueAction = fn
  }

  private computeMutatedState (): void {
    this.mutationsEmittingExternalMutations = {}

    const newState: T = { ...JSON.parse(JSON.stringify(toRaw(this.state))) }
    const externalStateMutations: Array<{ id: string, ts: number, module: string, fn: Function}> = []

    const applyMutation = (type: 'internal'|'external', id: string): void => {
      if (type === 'internal') {
        const mutation = this.pendingMutations[id]
        const action: Function = (this as any)[mutation.action]
        const propertyDescriptor = Object.getOwnPropertyDescriptor(action, mutationKey)
        if (!propertyDescriptor) throw new Error(`Action ${mutation.action} does not have a mutation function`)
        const { fn } = propertyDescriptor.value as { fn: Function }
        let emittedExternalMutation = false
        fn({
          state: newState,
          mutateResourceState: (module: string, fn: Function) => {
            if (this.mutationsEmittingExternalMutations[id] === hash(mutation.parameters)) return

            externalStateMutations.push({ id, ts: mutation.ts, module, fn })
            emittedExternalMutation = true
          }
        }, ...mutation.parameters)

        if (emittedExternalMutation) {
          this.mutationsEmittingExternalMutations[id] = hash(mutation.parameters)
        }
      } else {
        const mutation = this.externalMutations[id]
        mutation.handler(newState)
      }
    }

    const mutations = Object.keys(this.pendingMutations)
      .map(id => ({ type: 'internal', id, ts: this.pendingMutations[id].ts }))
      .concat(Object.keys(this.externalMutations)
        .map(id => ({ type: 'external', id, ts: this.externalMutations[id].ts })))
      .sort((a, b) => a.ts - b.ts)

    mutations.forEach(({ type, id }) => applyMutation(type as 'internal'|'external', id))

    if (externalStateMutations.length) {
      this.emit('internal:externalMutations:create', externalStateMutations)
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
    if (Object.keys(this.mutationsEmittingExternalMutations).includes(id)) {
      this.emit('internal:externalMutations:cancel', [id])
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
    const mutation = this.pendingMutations[id]
    if (!mutation) throw new Error(`No pending mutation with id ${id}`)
  }

  addExternalMutations (mutations: Array<{ id: string, ts: number, fn: (state: T) => void }>): void {
    mutations.forEach(({ id, ts, fn }) => {
      this.externalMutations[id] = { ts, handler: fn }
    })

    this.computeMutatedState()
  }

  cancelExternalMutations (ids: string[]): void {
    let deletedMutations = false

    ids.forEach((id) => {
      if (!this.externalMutations[id]) return

      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete this.externalMutations[id]
      deletedMutations = true
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
