import { isTemporaryIdentifier } from '@cyon/eremite'
import { computed, ref, unref, reactive, isReactive, watch, isRef } from 'vue'
import useResourceState from './useResourceState'
import useResource from './useResource'

export default function (resource, id, storeName = 'default') {
  const _resource = useResource(resource, storeName)
  const resourceState = useResourceState(resource, storeName)

  const loading = ref(false)

  const item = computed(() => {
    const returnValue = resourceState.value.items?.[unref(id)] ?? null
    return returnValue
  })

  const fetchRequiredData = () => {
    if (!unref(id)) return
    if (isTemporaryIdentifier(unref(id))) return

    if (resourceState.value.items?.[unref(id)]) {
      return
    }

    loading.value = true
    _resource.getItem(unref(id))
      .finally(() => {
        loading.value = false
      })
  }

  if (isReactive(id) || isRef(id)) {
    watch(id, fetchRequiredData)
  }

  fetchRequiredData()

  return reactive({
    loading,
    item,
    refetch: () => { return fetchRequiredData() }
  })
}
