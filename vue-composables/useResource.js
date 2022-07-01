import useStore from './useStore'

export default function useResource (resourceName, storeName = 'default') {
  const store = useStore(storeName)
  const resource = store.getResource(resourceName)
  return resource
}
