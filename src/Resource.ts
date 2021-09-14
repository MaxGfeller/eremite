import EventEmitter from 'eventemitter3'
import { reactive, readonly, Ref, ref, toRaw, unref } from '@vue/reactivity'
import { watch } from '@vue/runtime-core'

export const mutationKey = Symbol('mutateFn')

export enum MutationState {
  ready,
  cancelled,
  applied,
  committed
}

export class Mutation {
  state: MutationState
  protected fn: Function
  protected parameters: any[]

  constructor (fn: Function, parameters: any[]) {
    this.fn = fn
    this.parameters = parameters
    this.state = MutationState.ready
  }

  setParameters (...parameters: any[]): void {
    this.parameters = parameters
  }

  cancel (): void {
    this.state = MutationState.cancelled
  }
}

export function useContext (o: Object): { mutation: Mutation | null } {
  const mutationParameters = Object.getOwnPropertyDescriptor(o, mutationKey)
  if (!mutationParameters) return { mutation: null }
  return { mutation: new Mutation(mutationParameters.value.fn, mutationParameters.value.parameters) }
}

interface ResourceEvents<T> {
  'state:update': [T]
  'mutatedState:update': [T]
}

export abstract class Resource<T extends Object> extends EventEmitter<ResourceEvents<T>> {
  protected state: T
  protected mutatedState: Ref<T|null>
  protected pendingMutations: Array<{ action: string, parameters: any[] }> = []

  constructor () {
    super()

    // expose state as a reactive object AND emit events, this way the consumer can decide
    this.state = reactive(this.initialState()) as T
    this.mutatedState = ref(null)

    this.computeMutatedState(true)

    watch(this.state, () => {
      this.computeMutatedState(true)
      // todo: persist
      this.emit('state:update', this.getState(false))
    })

    watch(this.mutatedState, () => {
      this.emit('mutatedState:update', this.getState(true))
    })
  }

  private computeMutatedState (stateChanged: boolean = false): void {
    const newState: T = stateChanged ? { ...(readonly(this.state) as T) } : { ...(this.mutatedState.value as T) }

    this.pendingMutations.forEach((mutation) => {
      const action: Function = (this as any)[mutation.action]
      const propertyDescriptor = Object.getOwnPropertyDescriptor(action, mutationKey)
      if (!propertyDescriptor) throw new Error(`Action ${mutation.action} does not have a mutation function`)
      const { fn } = propertyDescriptor.value as { fn: Function, parameters: any[] }
      fn({ state: newState }, ...mutation.parameters)
    })

    this.mutatedState.value = newState
  }

  addPendingMutation (action: string, ...parameters: any[]): void {
    this.pendingMutations.push({ action, parameters })
    this.computeMutatedState()
  }

  queueAction (fn: Function): void {
    setTimeout(fn, 2000)
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
