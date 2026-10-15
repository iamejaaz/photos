import { signOut as revoke } from './auth'
import { photosBackup } from './backup'
import { trimMediaCache } from './media'
import { siteOrigin } from './site'
import { forgetAccount, saveSite, savedAccounts, savedSite } from './sites'

export async function signOutOfThisSite() {
  const url = siteOrigin()
  const site = await savedSite()
  const { plugin } = await photosBackup()
  const status = await plugin.getStatus().catch(() => null)
  if (status?.signedIn && status.site === url) await plugin.signOut().catch(() => {})
  await trimMediaCache(0)
  await revoke(url, site?.clientId ?? '').catch(() => {})
  await forgetAccount(url)
  await saveSite((await savedAccounts())[0] ?? null)
  window.location.replace('/')
}
