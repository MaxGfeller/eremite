import { maxTriesKey } from '../Resource'

export function MaxTries (maxTries: number) {
  return (target: any, key: string, descriptor: PropertyDescriptor) => {
    Object.defineProperty(target, maxTriesKey, {
      value: maxTries,
      writable: true,
      enumerable: false,
      configurable: false
    })
  }
}
