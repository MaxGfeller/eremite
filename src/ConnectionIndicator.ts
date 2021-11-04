import EventEmitter from 'eventemitter3'

export interface ConnectionIndicatorEvents {
  'connection': [boolean]
}

export interface ConnectionIndicator extends EventEmitter<ConnectionIndicatorEvents> {
  isConnected: () => Promise<boolean>
  disconnect?: () => void
  reconnect?: () => Promise<void>
}
