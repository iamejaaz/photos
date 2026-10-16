import { readThrough } from './offline'
import { accessToken, onUnauthorized } from './session'
import { APP_HEADERS, siteOrigin } from './site'

const SITE_PATHS = /^\/(api|files|private|assets)\//

export const installFetch = () => {
  const original = window.fetch.bind(window)
  window.fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const origin = siteOrigin()
    const url = raw.startsWith('/') && SITE_PATHS.test(raw) ? `${origin}${raw}` : raw
    if (!url.startsWith(`${origin}/`)) return original(input, init)
    const send = () => {
      const headers = new Headers(init.headers ?? (input instanceof Request ? input.headers : undefined))
      headers.delete('X-Frappe-CSRF-Token')
      headers.set('Authorization', `Bearer ${accessToken()}`)
      for (const [key, value] of Object.entries(APP_HEADERS)) headers.set(key, value)
      return original(url, { ...init, headers, credentials: 'omit' })
    }
    const body = typeof init.body === 'string' ? init.body : ''
    return readThrough(url, body, async () => {
      const response = await send()
      if (response.status === 401 && (await onUnauthorized())) return send()
      return response
    })
  }
}
