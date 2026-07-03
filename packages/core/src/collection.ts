/**
 * Collections: typed maps of entities keyed by ID.
 *
 * `CollectionSnapshot` is the immutable read view handed to the UI.
 * `DraftCollection` is the copy-on-write view mutators write to: the
 * underlying base map is only cloned when the first write happens, and
 * individual entities are cloned before being touched, so base state and
 * previous snapshots are never mutated in place.
 */

export interface CollectionDef<T extends object> {
  /** Phantom field carrying the entity type; never set at runtime. */
  readonly _entity?: T
}

export function collection<T extends object> (): CollectionDef<T> {
  return {}
}

export type CollectionsDef = Record<string, CollectionDef<any>>
export type EntityOf<D> = D extends CollectionDef<infer T> ? T : never

/** Entities in derived (optimistic) snapshots may carry a `$pending` marker. */
export type WithPending<T> = T & { $pending?: true }

export class CollectionSnapshot<T extends object> {
  constructor (private readonly map: Map<string, WithPending<T>>) {}

  get (id: string | number): WithPending<T> | undefined {
    return this.map.get(String(id))
  }

  has (id: string | number): boolean {
    return this.map.has(String(id))
  }

  get size (): number {
    return this.map.size
  }

  keys (): string[] {
    return [...this.map.keys()]
  }

  all (): Array<WithPending<T>> {
    return [...this.map.values()]
  }

  where (predicate: (entity: WithPending<T>, id: string) => boolean): Array<WithPending<T>> {
    const out: Array<WithPending<T>> = []
    for (const [id, entity] of this.map) {
      if (predicate(entity, id)) out.push(entity)
    }
    return out
  }

  entries (): Array<[string, WithPending<T>]> {
    return [...this.map.entries()]
  }
}

export class DraftCollection<T extends object> {
  private map: Map<string, T>
  private cloned = false
  /** Keys written (set or updated) in this draft. */
  readonly written = new Set<string>()
  /** Keys deleted in this draft. */
  readonly deleted = new Set<string>()

  constructor (base: Map<string, T>) {
    this.map = base
  }

  get changed (): boolean {
    return this.cloned
  }

  private ensureCloned (): void {
    if (!this.cloned) {
      this.map = new Map(this.map)
      this.cloned = true
    }
  }

  /** Read a copy of an entity. Mutating the returned object has no effect. */
  get (id: string | number): T | undefined {
    const value = this.map.get(String(id))
    return value === undefined ? undefined : structuredClone(value)
  }

  has (id: string | number): boolean {
    return this.map.has(String(id))
  }

  get size (): number {
    return this.map.size
  }

  all (): T[] {
    return [...this.map.values()].map(v => structuredClone(v))
  }

  where (predicate: (entity: T, id: string) => boolean): T[] {
    const out: T[] = []
    for (const [id, entity] of this.map) {
      if (predicate(entity, id)) out.push(structuredClone(entity))
    }
    return out
  }

  set (id: string | number, value: T): void {
    this.ensureCloned()
    const key = String(id)
    this.map.set(key, structuredClone(value))
    this.written.add(key)
    this.deleted.delete(key)
  }

  /**
   * Update an entity in place. A no-op when the entity does not exist —
   * mutations replay against states the entity may have vanished from
   * (e.g. after a pull), and replays must not throw.
   */
  update (id: string | number, updater: (entity: T) => void): void {
    const key = String(id)
    const current = this.map.get(key)
    if (current === undefined) return
    const next = structuredClone(current)
    updater(next)
    this.ensureCloned()
    this.map.set(key, next)
    this.written.add(key)
  }

  delete (id: string | number): void {
    const key = String(id)
    if (!this.map.has(key)) return
    this.ensureCloned()
    this.map.delete(key)
    this.deleted.add(key)
    this.written.delete(key)
  }

  /** The resulting map. Only safe to use after all writes are done. */
  result (): Map<string, T> {
    return this.map
  }
}
