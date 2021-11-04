import { mutationKey } from '../Resource'

export function Queueable (fn?: ({ pendingActions: Array<{}>, setDependency: (id: string) => void })) {
  return (target: any, key: string, descriptor: PropertyDescriptor) => {
    const propertyDescriptor = Object.getOwnPropertyDescriptor(target, mutationKey)
    if (!propertyDescriptor) throw new Error('No property descriptor found.')

    const mutationFn = propertyDescriptor.value.fn
    const fn = descriptor.value

    descriptor.value = function (...args: any[]) {
      return target.queueAction.call(this, key, args)
    }

    Object.defineProperty(descriptor.value, mutationKey, {
      value: {
        fn: mutationFn
      },
      writable: true,
      enumerable: false,
      configurable: false
    })

    Object.defineProperty(descriptor.value, 'originalFn', {
      value: fn,
      writable: false,
      enumerable: false,
      configurable: false
    })
  }
}
