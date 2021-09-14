import { mutationKey } from '../Resource'

export function Mutate<T extends Object> (fn: (opts: { state: T }) => void) {
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
