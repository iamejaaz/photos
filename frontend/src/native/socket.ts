import { registerPlugin } from '@capacitor/core'

type Handler = (...args: unknown[]) => void
type Handle = { remove: () => Promise<void> }
type Target = { url: string; namespace: string; origin: string }

type PhotosSocketPlugin = {
  connect(options: Target & { token: string }): Promise<void>
  disconnect(): Promise<void>
  emit(options: { event: string; args: unknown[] }): Promise<void>
  setToken(options: { token: string }): Promise<void>
  addListener(
    name: string,
    handler: (payload: { event?: string; args?: unknown[]; message?: string }) => void,
  ): Promise<Handle>
}

const plugin = registerPlugin<PhotosSocketPlugin>('PhotosSocket')

class NativeSocket {
  connected = false
  private handlers = new Map<string, Set<Handler>>()
  private queue: { event: string; args: unknown[] }[] = []

  constructor(
    private target: Target,
    private token: () => string,
  ) {}

  async start() {
    await plugin.addListener('connect', () => {
      this.connected = true
      const queued = this.queue
      this.queue = []
      queued.forEach(({ event, args }) => plugin.emit({ event, args }).catch(() => {}))
      this.dispatch('connect', [])
    })
    await plugin.addListener('disconnect', () => {
      this.connected = false
      this.dispatch('disconnect', [])
    })
    await plugin.addListener('connect_error', ({ message }) => this.dispatch('connect_error', [message]))
    await plugin.addListener('event', ({ event, args }) => event && this.dispatch(event, args ?? []))
    await plugin.connect({ ...this.target, token: this.token() })
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && !this.connected) this.connect()
    })
  }

  on(event: string, handler: Handler) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set())
    this.handlers.get(event)!.add(handler)
    return this
  }

  off(event: string, handler?: Handler) {
    if (handler) this.handlers.get(event)?.delete(handler)
    else this.handlers.delete(event)
    return this
  }

  emit(event: string, ...args: unknown[]) {
    if (this.connected) plugin.emit({ event, args }).catch(() => {})
    else this.queue.push({ event, args })
    return this
  }

  connect() {
    plugin.connect({ ...this.target, token: this.token() }).catch(() => {})
    return this
  }

  setToken(token: string) {
    plugin
      .setToken({ token })
      .then(() => {
        if (!this.connected) return plugin.connect({ ...this.target, token })
      })
      .catch(() => {})
  }

  private dispatch(event: string, args: unknown[]) {
    this.handlers.get(event)?.forEach((handler) => handler(...args))
  }
}

let socketInstance: NativeSocket | null = null

export function startSocket(target: Target, token: () => string) {
  socketInstance = new NativeSocket(target, token)
  socketInstance.start().catch(() => {})
  return socketInstance
}

export const initSocket = () => socketInstance!

export const getSocket = () => socketInstance
