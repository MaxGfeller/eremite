import EventEmitter from 'eventemitter3'
import { ConnectionIndicator, ConnectionIndicatorEvents } from '../src'

export async function sleep (ms: number): Promise<void> {
  return await new Promise(resolve => setTimeout(resolve, ms))
}

export async function nextTick (): Promise<void> {
  return await sleep(0)
}

export class TestConnectionIndicator extends EventEmitter<ConnectionIndicatorEvents> implements ConnectionIndicator {
  protected onlineStatus: boolean = false

  setOnlineStatus (status: boolean): void {
    this.onlineStatus = status
    this.emit('connection', status)
  }

  isConnected (): boolean {
    return this.onlineStatus
  }

  disconnect (): void {
    this.setOnlineStatus(false)
  }

  async reconnect (): Promise<void> {
    await nextTick()
    this.setOnlineStatus(true)
  }
}
