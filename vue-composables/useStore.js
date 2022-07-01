import { inject } from 'vue'

export default function useStore (storeName = 'default') {
  const eremiteStores = inject('eremiteStores')
  const store = eremiteStores[storeName]

  return store
}
