import { withPrefs } from './platform'

export type Site = { url: string; name: string; sitename: string; clientId: string }

const SITE_KEY = 'site'
const LAST_ADDRESS_KEY = 'last-site-address'

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
export type ProbeResult =
  { site: Site } | { error: 'unreachable' | 'not-photos' | 'no-client' } | { error: 'down'; status: number }

export const siteProblem = (url: string, status: number | null) => {
  const host = new URL(url).host
  if (!status) return __('Could not reach {0}. Check your internet connection.', [host])
  if (status === 503) return __('{0} is being updated. Try again in a few minutes.', [host])
  if (status === 502 || status === 504)
    return __('{0} is not responding right now. Try again in a few minutes.', [host])
  if (status >= 500) return __('{0} ran into an error ({1}). Try again in a few minutes.', [host, status])
  return __('{0} answered with an error ({1}).', [host, status])
}

export const siteStatus = async (url: string): Promise<number | null> => {
  const { CapacitorHttp } = await import('@capacitor/core')
  try {
    const res = await CapacitorHttp.get({
      url: `${url}/api/method/ping`,
      connectTimeout: 8000,
      readTimeout: 8000,
    })
    return res.status >= 400 ? res.status : null
  } catch {
    return null
  }
}

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
  if (res.status >= 500) return { error: 'down', status: res.status }
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

export const rememberSiteAddress = (url: string) =>
  withPrefs((p) => p.set({ key: LAST_ADDRESS_KEY, value: url.replace(/^https:\/\//, '') }))

export const saveSite = async (site: Site | null) => {
  if (site) await rememberSiteAddress(site.url)
  return withPrefs((p) =>
    site ? p.set({ key: SITE_KEY, value: JSON.stringify(site) }) : p.remove({ key: SITE_KEY }),
  )
}

export const lastSiteAddress = (): Promise<string> =>
  withPrefs(async (p) => (await p.get({ key: LAST_ADDRESS_KEY })).value ?? '')

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
