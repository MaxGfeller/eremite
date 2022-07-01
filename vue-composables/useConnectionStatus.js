import { ref } from 'vue'
import useStore from './useStore'

export default function (storeName = 'default') {
  const store = useStore(storeName)

  const connected = ref(store.isConnected())

  store.on('connection', (con) => {
    connected.value = con
  })

  return {
    connected,
    disconnect: () => store.disconnect(),
    reconnect: () => store.reconnect()
  }
}
