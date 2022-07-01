import { createApp } from 'vue'
import App from './App.vue'
import { Eremite, BrowserConnectionIndicator } from '@cyon/eremite'
import EremiteVue from '@cyon/eremite/vue-composables/EremiteVue'
import { Articles } from './store/Articles'

const store = new Eremite({
  name: 'offline-hacker',
  connectionIndicator: new BrowserConnectionIndicator(),
  resources: {
    'articles': new Articles()
  }
})

const app = createApp(App)
app.use(EremiteVue, store)
app.mount('#app')
