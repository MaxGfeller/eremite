import { mutationKey } from '../Resource'

export function Queueable () {
  return (target: any, key: string, descriptor: PropertyDescriptor) => {
    const propertyDescriptor = Object.getOwnPropertyDescriptor(target, mutationKey)
    if (!propertyDescriptor) throw new Error('No property descriptor found.')

    const mutationFn = propertyDescriptor.value.fn
    const fn = descriptor.value

    descriptor.value = function (...args: any[]) {
      const oldDescriptor = Object.getOwnPropertyDescriptor(descriptor.value, mutationKey)
      if (oldDescriptor) {
        oldDescriptor.value.parameters = args
      }

      return target.queueAction(() => {
        return fn.apply(target, args)
      })
    }

    Object.defineProperty(descriptor.value, mutationKey, {
      value: {
        fn: mutationFn
      },
      writable: true,
      enumerable: false,
      configurable: false
    })
  }
}
