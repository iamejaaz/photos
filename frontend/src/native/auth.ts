import { codeChallengeS256, randomString } from './pkce'
import { photosShell } from './shell'

export const REDIRECT_SCHEME = 'io.frappe.photos'
export const REDIRECT_URL = `${REDIRECT_SCHEME}://oauth`
const SCOPE = 'all openid'
const TOKEN_ENDPOINT = '/api/method/frappe.integrations.oauth2.get_token'

export type StoredTokens = { accessToken: string; refreshToken?: string; expiresAt: number }
export type Callback = { code?: string; state?: string; error?: string; error_description?: string }

export const buildAuthorizeUrl = (
  site: string,
  clientId: string,
  state: string,
  challenge: string,
): string => {
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    scope: SCOPE,
    redirect_uri: REDIRECT_URL,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  })
  return `${site}/api/method/frappe.integrations.oauth2.authorize?${params.toString()}`
}

export const parseCallback = (url: string): Callback | null => {
  const [base, queryPart] = url.split('#')[0].split('?')
  if (base !== REDIRECT_URL && base !== `${REDIRECT_URL}/`) return null
  if (queryPart === undefined) return {}
  const query = new URLSearchParams(queryPart)
  const callback: Callback = {}
  for (const field of ['code', 'state', 'error', 'error_description'] as const) {
    if (query.has(field)) callback[field] = query.get(field) ?? undefined
  }
  return callback
}

const key = (site: string) => `photos.tokens.${site}`
const withSecure = <T>(
  fn: (p: typeof import('capacitor-secure-storage-plugin').SecureStoragePlugin) => Promise<T>,
): Promise<T> =>
  import('capacitor-secure-storage-plugin').then(({ SecureStoragePlugin }) => fn(SecureStoragePlugin))

export const tokenStore = {
  async get(site: string): Promise<StoredTokens | null> {
    try {
      const { value } = await withSecure((p) => p.get({ key: key(site) }))
      const parsed = JSON.parse(value) as StoredTokens
      if (typeof parsed?.accessToken !== 'string' || typeof parsed.expiresAt !== 'number') return null
      return parsed
    } catch {
      return null
    }
  },
  async set(site: string, tokens: StoredTokens) {
    await withSecure((p) => p.set({ key: key(site), value: JSON.stringify(tokens) }))
  },
  async remove(site: string) {
    await withSecure((p) => p.remove({ key: key(site) })).catch(() => {})
  },
}

type TokenResponse = { access_token?: string; refresh_token?: string; expires_in?: number; error?: string }

export type AuthDeps = {
  authorize: (url: string) => Promise<string | null>
  post: (url: string, form: Record<string, string>) => Promise<{ status: number; data: unknown }>
  store: typeof tokenStore
  pkce: { verifier: () => string; challenge: (v: string) => Promise<string>; state: () => string }
  now: () => number
}

export const defaultDeps: AuthDeps = {
  authorize: async (url) => {
    const { plugin } = await photosShell()
    const { url: callback } = await plugin.authorize({ url, scheme: REDIRECT_SCHEME, redirect: REDIRECT_URL })
    return callback ?? null
  },
  post: async (url, form) => {
    const { CapacitorHttp } = await import('@capacitor/core')
    const res = await CapacitorHttp.post({
      url,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      data: form,
      connectTimeout: 8000,
      readTimeout: 8000,
    })
    return { status: res.status, data: res.data }
  },
  store: tokenStore,
  pkce: { verifier: () => randomString(32), challenge: codeChallengeS256, state: () => randomString(16) },
  now: () => Date.now(),
}

export const rejectedExchange = (reason: string) =>
  Object.assign(new Error(reason), { rejected: true as const })
export const isRejectedExchange = (e: unknown): boolean => !!(e as { rejected?: boolean } | null)?.rejected

const exchange = async (
  site: string,
  form: Record<string, string>,
  prev: StoredTokens | null,
  deps: AuthDeps,
): Promise<StoredTokens> => {
  const res = await deps.post(`${site}${TOKEN_ENDPOINT}`, form)
  const data = res.data as TokenResponse | null
  if (res.status >= 500) throw new Error(`Token endpoint answered ${res.status}`)
  if (res.status < 200 || res.status >= 300 || !data?.access_token)
    throw rejectedExchange(data?.error || 'Token exchange failed')
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? prev?.refreshToken,
    expiresAt: deps.now() + (data.expires_in ?? 3600) * 1000,
  }
}

const readCallback = (url: string | null, state: string): Callback => {
  if (url === null) throw new Error('Sign-in was cancelled')
  const callback = parseCallback(url)
  if (!callback) throw new Error('Sign-in came back to an address that is not ours')
  if (callback.error) {
    if (callback.state === state || callback.state === undefined)
      throw new Error(callback.error_description || callback.error)
    throw new Error('Sign-in answered a different request')
  }
  if (callback.state !== state) throw new Error('Sign-in answered a different request')
  if (!callback.code) throw new Error('Callback carried no authorization code')
  return callback
}

export const signIn = async (
  site: string,
  clientId: string,
  deps: AuthDeps = defaultDeps,
): Promise<StoredTokens> => {
  const verifier = deps.pkce.verifier()
  const state = deps.pkce.state()
  const challenge = await deps.pkce.challenge(verifier)
  const callback = readCallback(
    await deps.authorize(buildAuthorizeUrl(site, clientId, state, challenge)),
    state,
  )
  const tokens = await exchange(
    site,
    {
      grant_type: 'authorization_code',
      code: callback.code ?? '',
      client_id: clientId,
      redirect_uri: REDIRECT_URL,
      code_verifier: verifier,
    },
    null,
    deps,
  )
  await deps.store.set(site, tokens)
  return tokens
}

export const refreshTokens = async (
  site: string,
  clientId: string,
  deps: AuthDeps = defaultDeps,
): Promise<StoredTokens> => {
  const prev = await deps.store.get(site)
  if (!prev?.refreshToken) throw rejectedExchange('No refresh token')
  const tokens = await exchange(
    site,
    { grant_type: 'refresh_token', refresh_token: prev.refreshToken, client_id: clientId },
    prev,
    deps,
  )
  await deps.store.set(site, tokens)
  return tokens
}

export const revokeTokens = async (
  site: string,
  clientId: string,
  tokens: StoredTokens,
  deps: AuthDeps = defaultDeps,
) => {
  const revoke = (token: string, hint: string) =>
    deps
      .post(`${site}/api/method/frappe.integrations.oauth2.revoke_token`, {
        token,
        token_type_hint: hint,
        client_id: clientId,
      })
      .catch(() => {})
  await Promise.all([
    tokens.refreshToken && revoke(tokens.refreshToken, 'refresh_token'),
    revoke(tokens.accessToken, 'access_token'),
  ])
}

export const signOut = async (site: string, clientId: string, deps: AuthDeps = defaultDeps) => {
  const tokens = await deps.store.get(site)
  await deps.store.remove(site)
  if (tokens) await revokeTokens(site, clientId, tokens, deps)
}
