import { isTemporaryIdentifier } from '@cyon/eremite'
import useResourceState from './useResourceState'
import useResource from './useResource'
import { watch, computed, unref } from 'vue'

export default function useResourceList (resource, opts, storeName = 'default') {
  const currentFetches = []

  const _resource = useResource(resource, storeName)
  const resourceState = useResourceState(resource, storeName)

  watch(opts, () => {
    _resource.getList(unref(opts.from), unref(opts.to), unref(opts.namespace))
  })

  _resource.getList(unref(opts.from), unref(opts.to), unref(opts.namespace))

  const list = computed(() => {
    const refetchFn = () => _resource.getList(unref(opts.from), unref(opts.to), unref(opts.namespace))

    const namespace = resourceState.value.namespaces[unref(opts.namespace)]
    const resourceItems = resourceState.value.items

    if (!namespace || namespace.total === 0) return { total: 0, items: [], refetchPage: refetchFn }

    const from = unref(opts.from) || 0
    let to = unref(opts.to) || 0

    if (unref(opts.to) >= namespace?.total) to = namespace?.total

    const items = namespace.items
      .slice(from, to)
      .filter(Boolean)
      .map((item) => {
        const id = _resource.getId(item)
        if (!id) return { ...item, _fetchedDetails: false }

        const detailedItem = resourceItems[id]
        if (!detailedItem) return { ...item, _fetchedDetails: false }

        return { ...item, ...detailedItem, _fetchedDetails: true }
      })

    return { total: namespace.total, items, refetchPage: refetchFn }
  })

  if (opts.poll) {
    setInterval(() => {
      _resource.getList(unref(opts.from), unref(opts.to), unref(opts.namespace))
    }, opts.poll)
  }

  _resource.getList(unref(opts.from), unref(opts.to), unref(opts.namespace))

  if (opts.fetchDetails) {
    // todo: use opts.fetchSpreading
    const initialWait = 500
    const waitEach = 500

    // eslint-disable-next-line
    const fetchDetails = () => {
      list.value.items.forEach((item, index) => {
        const itemId = _resource.getId(item)
        if (item._fetchedDetails || currentFetches.includes(itemId) || isTemporaryIdentifier(itemId)) return

        if (!itemId) return

        currentFetches.push(itemId)
        setTimeout(() => {
          _resource.getItem(itemId)
            .then((result) => {
              currentFetches.splice(currentFetches.indexOf(itemId), 1)
            })
            .catch((err) => {
              throw err
            })
        }, initialWait + index * waitEach)
      })
    }

    watch(list, () => {
      // fetchDetails()
    })

    // fetchDetails()
  }

  return list
}
