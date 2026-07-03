export async function sleep (ms: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms))
}

export async function waitUntil (condition: () => boolean, timeoutMs = 5000): Promise<void> {
  const start = Date.now()
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('waitUntil: condition not met within timeout')
    }
    await sleep(5)
  }
}

export function httpError (status: number, message = `HTTP ${status}`): Error & { status: number } {
  return Object.assign(new Error(message), { status })
}

export function networkError (): TypeError {
  return new TypeError('fetch failed')
}
