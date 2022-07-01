import { Eremite } from '@cyon/eremite'

export default {
  install (app, stores) {
    let _stores = {}
    if (stores instanceof Eremite) {
      _stores.default = stores
    } else {
      _stores = stores
    }

    app.provide('eremiteStores', _stores)
  }
}
