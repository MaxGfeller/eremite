import { mutationKey } from '../Resource'

export function Queueable (fn?: ({ pendingActions: Array<{}>, setDependency: (id: string) => void })) {
  return (target: any, key: string, descriptor: PropertyDescriptor) => {
    const mutationPropertyDescriptor = Object.getOwnPropertyDescriptor(target, mutationKey)

    const fn = descriptor.value

    descriptor.value = function (...args: any[]) {
      return target.queueAction.call(this, key, args)
    }

    if (mutationPropertyDescriptor) {
      const mutationFn = mutationPropertyDescriptor.value.fn

      Object.defineProperty(descriptor.value, mutationKey, {
        value: {
          fn: mutationFn
        },
        writable: true,
        enumerable: false,
        configurable: false
      })
    }

    Object.defineProperty(descriptor.value, 'originalFn', {
      value: fn,
      writable: false,
      enumerable: false,
      configurable: false
    })
  }
}
