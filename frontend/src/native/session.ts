import { isRejectedExchange, refreshTokens, tokenStore, type StoredTokens } from './auth'
import type { Site } from './sites'

const EXPIRY_MARGIN_MS = 5 * 60_000
const RETRY_MS = 30_000

type Access = Pick<StoredTokens, 'accessToken' | 'expiresAt'>
type Refresh = 'ok' | 'rejected' | 'unreachable'

let current: { site: Site; tokens: Access } | null = null
let timer: ReturnType<typeof setTimeout> | undefined
let refreshing: Promise<Refresh> | null = null
let sessionLost: () => void = () => {}
let tokenRefreshed: (token: string) => void = () => {}

export const setSessionLostHandler = (fn: () => void) => (sessionLost = fn)
export const setTokenRefreshedHandler = (fn: (token: string) => void) => (tokenRefreshed = fn)

export const accessToken = () => current?.tokens.accessToken ?? ''

const schedule = () => {
  clearTimeout(timer)
  if (!current) return
  const lifetime = current.tokens.expiresAt - Date.now()
  timer = setTimeout(refreshNow, lifetime > 0 ? lifetime * 0.8 : RETRY_MS)
}

export const refreshNow = (): Promise<Refresh> => {
  if (refreshing) return refreshing
  if (!current) return Promise.resolve('rejected')
  const { site } = current
  refreshing = refreshTokens(site.url, site.clientId)
    .then((tokens): Refresh => {
      if (current?.site.url === site.url) {
        current.tokens = { accessToken: tokens.accessToken, expiresAt: tokens.expiresAt }
        schedule()
      }
      tokenRefreshed(tokens.accessToken)
      return 'ok'
    })
    .catch((error): Refresh => {
      if (isRejectedExchange(error)) return 'rejected'
      if (current?.site.url === site.url) schedule()
      return 'unreachable'
    })
    .finally(() => (refreshing = null))
  return refreshing
}

export const startSession = async (site: Site): Promise<'ok' | 'rejected' | null> => {
  const tokens = await tokenStore.get(site.url)
  if (!tokens) return null
  current = { site, tokens: { accessToken: tokens.accessToken, expiresAt: tokens.expiresAt } }
  if (tokens.expiresAt - Date.now() < EXPIRY_MARGIN_MS && (await refreshNow()) === 'rejected') {
    current = null
    return 'rejected'
  }
  schedule()
  return 'ok'
}

export const onUnauthorized = async () => {
  if (!current) return false
  const result = await refreshNow()
  if (result === 'rejected') {
    clearTimeout(timer)
    current = null
    sessionLost()
  }
  return result === 'ok'
}
