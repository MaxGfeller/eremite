import { v4 as uuid } from 'uuid'

export function createTemporaryIdentifier (): string {
  return `erm_id_${uuid()}`
}

export function isTemporaryIdentifier (id: any): boolean {
  if (typeof id !== 'string') {
    return false
  }

  return id.startsWith('erm_id_')
}
