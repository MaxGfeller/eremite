import { EventEmitter } from 'eventemitter3'
import { ConnectionIndicator, ConnectionIndicatorEvents } from './ConnectionIndicator'

export class BrowserConnectionIndicator extends EventEmitter<ConnectionIndicatorEvents> implements ConnectionIndicator {
  constructor () {
    super()

    window.addEventListener('offline', () => {
      this.emit('connection', false)
    })

    window.addEventListener('online', () => {
      this.emit('connection', true)
    })
  }

  async isConnected (): Promise<boolean> {
    return window.navigator.onLine
  }
}
