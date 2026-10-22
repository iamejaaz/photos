import { App } from '@capacitor/app'
import { toast } from 'frappe-ui'

import { siteOrigin } from './site'
import { normalizeSiteUrl, savedAccounts, switchAccount } from './sites'

const PREFIX = 'io.frappe.photos://open'
const AFTER_SWITCH_KEY = 'photos-open-after-switch'

async function show(path: string) {
  const { default: router } = await import('../router')
  router.push(path || '/')
}

async function go(url: string | undefined) {
  if (!url?.startsWith(PREFIX)) return
  const link = new URL(url.slice(PREFIX.length) || '/', window.location.origin)
  const site = link.searchParams.get('site')
  link.searchParams.delete('site')
  const path = `${link.pathname}${link.search}`
  const target = site && normalizeSiteUrl(site)
  if (!target || target === normalizeSiteUrl(siteOrigin())) return show(path)
  const account = (await savedAccounts()).find((item) => normalizeSiteUrl(item.url) === target)
  if (!account) {
    toast.info(__('This link is from {0}. Add that site in the app to open it here.', [new URL(target).host]))
    return
  }
  sessionStorage.setItem(AFTER_SWITCH_KEY, path)
  await switchAccount(account)
}

export async function watchOpenLinks() {
  await App.addListener('appUrlOpen', ({ url }) => go(url))
  const pending = sessionStorage.getItem(AFTER_SWITCH_KEY)
  sessionStorage.removeItem(AFTER_SWITCH_KEY)
  if (pending) return show(pending)
  go((await App.getLaunchUrl())?.url)
}
