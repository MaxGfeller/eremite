import { mutationKey } from '../Resource'

// todo: scope angeben (falls nur "session" wird es beim Verlassen, resp. wieder öffnen, wieder gelöscht)

export function Queueable (opts: {
  session?: boolean
  setDependencies?: ({ pendingActions: Array<{}>, setDependency: (id: string) => void })
} = {}) {
  return (target: any, key: string, descriptor: PropertyDescriptor) => {
    const mutationPropertyDescriptor = Object.getOwnPropertyDescriptor(target, mutationKey)

    const fn = descriptor.value

    descriptor.value = function (...args: any[]) {
      return target.queueAction.call(this, key, args, { session: opts.session ?? false })
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
