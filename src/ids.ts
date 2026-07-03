/**
 * ID utilities.
 *
 * Eremite's primary path is client-generated permanent IDs (UUIDv7), which
 * dissolve the temporary-ID problem entirely. For backends that insist on
 * assigning IDs themselves, mutations can mint *refs*: stable placeholder
 * strings that are resolved to the real ID once the server responds.
 */

const HEX: string[] = []
for (let i = 0; i < 256; i++) HEX.push(i.toString(16).padStart(2, '0'))

let lastTimestamp = -1
let seqCounter = 0

/**
 * UUIDv7: time-ordered, collision-safe, valid as a permanent primary key.
 * A monotonic sequence counter keeps IDs generated in the same millisecond
 * sortable in creation order.
 */
export function uuidv7 (): string {
  let ts = Date.now()
  if (ts === lastTimestamp) {
    seqCounter++
    // Extremely unlikely: more than 4096 IDs in one ms. Borrow from the future.
    if (seqCounter > 0xfff) { ts++; seqCounter = 0 }
  } else {
    lastTimestamp = ts
    seqCounter = 0
  }

  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)

  bytes[0] = (ts / 2 ** 40) & 0xff
  bytes[1] = (ts / 2 ** 32) & 0xff
  bytes[2] = (ts / 2 ** 24) & 0xff
  bytes[3] = (ts / 2 ** 16) & 0xff
  bytes[4] = (ts / 2 ** 8) & 0xff
  bytes[5] = ts & 0xff
  // version 7 + 12-bit sequence in rand_a
  bytes[6] = 0x70 | ((seqCounter >> 8) & 0x0f)
  bytes[7] = seqCounter & 0xff
  // variant
  bytes[8] = (bytes[8] & 0x3f) | 0x80

  let out = ''
  for (let i = 0; i < 16; i++) {
    if (i === 4 || i === 6 || i === 8 || i === 10) out += '-'
    out += HEX[bytes[i]]
  }
  return out
}

export const REF_PREFIX = 'erm.ref:'

/**
 * A placeholder for a server-assigned ID. Refs are plain strings so they can
 * be used as map keys, embedded in mutation inputs and persisted as-is.
 */
export type Ref = string

export function mintRef (): Ref {
  return REF_PREFIX + uuidv7()
}

export function isRef (value: unknown): value is Ref {
  return typeof value === 'string' && value.startsWith(REF_PREFIX)
}

function isPlainObject (value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/**
 * Collect every ref appearing anywhere in a value (including object keys).
 */
export function collectRefs (value: unknown, out: Set<Ref> = new Set()): Set<Ref> {
  if (isRef(value)) {
    out.add(value)
  } else if (Array.isArray(value)) {
    for (const item of value) collectRefs(item, out)
  } else if (isPlainObject(value)) {
    for (const key of Object.keys(value)) {
      if (isRef(key)) out.add(key)
      collectRefs(value[key], out)
    }
  }
  return out
}

/**
 * Deeply rebuild a value, replacing every resolved ref (in values *and*
 * object keys) with its real ID. Unresolved refs are left in place.
 * Always returns a fresh structure for objects/arrays, so callers can hand
 * the result to user code without risking mutation of the original.
 */
export function substituteRefs<T> (value: T, resolve: (ref: Ref) => string | number | undefined): T {
  if (isRef(value)) {
    const resolved = resolve(value)
    return (resolved !== undefined ? resolved : value) as unknown as T
  }
  if (Array.isArray(value)) {
    return value.map(item => substituteRefs(item, resolve)) as unknown as T
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value)) {
      let outKey = key
      if (isRef(key)) {
        const resolved = resolve(key)
        if (resolved !== undefined) outKey = String(resolved)
      }
      out[outKey] = substituteRefs(value[key], resolve)
    }
    return out as unknown as T
  }
  return value
}
