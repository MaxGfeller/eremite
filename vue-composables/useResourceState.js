import { inject } from 'vue'

export default function useResourceState (resourceName, storeName = 'default') {
  const eremiteStores = inject('eremiteStores')
  const store = eremiteStores[storeName]

  const resource = store.getResource(resourceName)
  const state = resource.getReactiveState()
  return state
}
