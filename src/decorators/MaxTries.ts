import { maxTriesKey } from '../Resource'

export function MaxTries (opts: { tries: number, wait?: number}) {
  return (target: any, key: string, descriptor: PropertyDescriptor) => {
    Object.defineProperty(target, maxTriesKey, {
      value: opts,
      writable: true,
      enumerable: false,
      configurable: false
    })
  }
}
