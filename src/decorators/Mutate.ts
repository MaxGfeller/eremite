import { mutationKey, TemporaryIdentifier } from '../Resource'

export function Mutate<T extends Object> (fn: (opts: {
  state: T
  mutateResourceState: (resource: string, fn: (state: any) => void) => void
  createTemporaryIdentifier: (label: string) => TemporaryIdentifier
  isCommit: boolean
}, ...parameters: any[]) => void) {
  return (target: any, key: string, descriptor: PropertyDescriptor) => {
    Object.defineProperty(target, mutationKey, {
      value: {
        fn
      },
      writable: true,
      enumerable: false,
      configurable: false
    })
  }
}
