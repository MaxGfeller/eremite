import { Resource } from './Resource'

type ListResourceState<T> = {
  total: number,
  items: T[]
}

type Namespace = 'default' | {
  [key: string]: any
}

type NamespaceListResourceState<T> = {
  [namespaceHash: string]: ListResourceState<T>
}

abstract class ListResource<T extends > extends Resource<T> {}
