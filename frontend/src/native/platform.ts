declare global {
  interface Window {
    Capacitor?: { isNativePlatform(): boolean; getPlatform(): string }
  }
}

export const isNative = (): boolean =>
  typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.() === true

export const nativePlatform = (): 'ios' | 'android' | 'web' => {
  const p = typeof window !== 'undefined' ? window.Capacitor?.getPlatform?.() : undefined
  return p === 'ios' || p === 'android' ? p : 'web'
}

export const nativePlugin = <T>(name: string): (() => Promise<{ plugin: T }>) => {
  let registered: Promise<{ plugin: T }> | undefined
  return () =>
    (registered ??= import('@capacitor/core').then(({ registerPlugin }) => ({
      plugin: registerPlugin<T>(name),
    })))
}

type Prefs = typeof import('@capacitor/preferences').Preferences
export const withPrefs = <T>(fn: (p: Prefs) => Promise<T>): Promise<T> =>
  import('@capacitor/preferences').then(({ Preferences }) => fn(Preferences))

type Handle = { remove: () => Promise<void> }
export const listenNative = (register: () => Promise<Handle>): (() => void) => {
  let disposed = false
  let handle: Handle | undefined
  register()
    .then((h) => {
      if (disposed) h.remove().catch(() => {})
      else handle = h
    })
    .catch(() => {})
  return () => {
    disposed = true
    handle?.remove().catch(() => {})
  }
}
