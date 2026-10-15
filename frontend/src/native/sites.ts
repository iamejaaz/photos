import { withPrefs } from './platform'

export type Site = { url: string; name: string; sitename: string; clientId: string }

const SITE_KEY = 'site'

const isLocalHost = (host: string) =>
  /^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(
    host,
  )

export const normalizeSiteUrl = (input: string): string | null => {
  const trimmed = input.trim()
  if (!trimmed) return null
  try {
    if (/^https?:\/\//i.test(trimmed)) return new URL(trimmed).origin
    const url = new URL(`https://${trimmed}`)
    return isLocalHost(url.hostname) ? `http://${url.host}` : url.origin
  } catch {
    return null
  }
}

type ClientInfo = { client_id?: string | null; sitename?: string; app_name?: string; photos_version?: string }
export type ProbeResult = { site: Site } | { error: 'unreachable' | 'not-photos' | 'no-client' }

export const probeSite = async (url: string): Promise<ProbeResult> => {
  const { CapacitorHttp } = await import('@capacitor/core')
  let res
  try {
    res = await CapacitorHttp.get({
      url: `${url}/api/method/photos.api.native.get_client_id`,
      connectTimeout: 8000,
      readTimeout: 8000,
    })
  } catch {
    return { error: 'unreachable' }
  }
  const message = (res.data as { message?: ClientInfo } | null)?.message
  if (res.status !== 200 || !message?.sitename || !message.photos_version) return { error: 'not-photos' }
  if (!message.client_id) return { error: 'no-client' }
  const origin = res.url ? new URL(res.url).origin : url
  return {
    site: {
      url: origin,
      name: message.app_name || 'Photos',
      sitename: message.sitename,
      clientId: message.client_id,
    },
  }
}

export const savedSite = (): Promise<Site | null> =>
  withPrefs(async (p) => {
    const { value } = await p.get({ key: SITE_KEY })
    try {
      return value ? (JSON.parse(value) as Site) : null
    } catch {
      return null
    }
  })

export const saveSite = (site: Site | null) =>
  withPrefs((p) =>
    site ? p.set({ key: SITE_KEY, value: JSON.stringify(site) }) : p.remove({ key: SITE_KEY }),
  )

export type Account = Site & { user: string; fullName: string; image: string | null }

const ACCOUNTS_KEY = 'accounts'
const ADDING_KEY = 'photos-adding-site'

export const savedAccounts = (): Promise<Account[]> =>
  withPrefs(async (p) => {
    const { value } = await p.get({ key: ACCOUNTS_KEY })
    try {
      return value ? (JSON.parse(value) as Account[]) : []
    } catch {
      return []
    }
  })

const writeAccounts = (accounts: Account[]) =>
  withPrefs((p) => p.set({ key: ACCOUNTS_KEY, value: JSON.stringify(accounts) }))

export const rememberAccount = async (account: Account) => {
  const accounts = (await savedAccounts()).filter((item) => item.url !== account.url)
  await writeAccounts([account, ...accounts])
}

export const forgetAccount = async (url: string) =>
  writeAccounts((await savedAccounts()).filter((item) => item.url !== url))

export const switchAccount = async (account: Site) => {
  await saveSite(account)
  window.location.replace('/')
}

export const isAddingSite = () => sessionStorage.getItem(ADDING_KEY) === '1'

export const startAddingSite = () => {
  sessionStorage.setItem(ADDING_KEY, '1')
  window.location.replace('/')
}

export const stopAddingSite = () => sessionStorage.removeItem(ADDING_KEY)
