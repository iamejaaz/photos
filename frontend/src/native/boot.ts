import { createApp } from 'vue'

import { translationPlugin } from '@/boot/translation'

import { tokenStore } from './auth'
import { photosBackup } from './backup'
import { installFetch } from './http'
import { watchExternalLinks } from './links'
import { setMediaSession, trimMediaCache } from './media'
import { clearOfflineData, offline, savedBoot, saveBoot } from './offline'
import { accessToken, setSessionLostHandler, setTokenRefreshedHandler, startSession } from './session'
import { setActiveSite } from './site'
import { getSocket, startSocket } from './socket'
import SitePicker from './SitePicker.vue'
import { type Site, isAddingSite, rememberAccount, savedSite, siteProblem, siteStatus } from './sites'

type Boot = {
  user: string
  full_name: string
  user_image: string | null
  roles: string[]
  sitename: string
  socketio_port: number
  csrf_token: string
}

const setCookie = (name: string, value: string | null | undefined) => {
  document.cookie = `${name}=${encodeURIComponent(value ?? '')}; path=/; SameSite=Lax`
}

const socketUrl = (origin: string, port: number) => {
  const url = new URL(origin)
  if (url.protocol === 'http:' && url.port) url.port = String(port)
  return url.origin
}

const showPicker = (site?: Site | null, notice?: string, cancellable = false) => {
  createApp(SitePicker, { site, notice, cancellable }).use(translationPlugin).mount('#app')
  import('./splash').then(({ hideSplash }) => hideSplash())
  return false
}

export async function startNative(): Promise<boolean> {
  document.documentElement.classList.add('native')
  const site = await savedSite()
  if (!site) return showPicker()
  if (isAddingSite()) return showPicker(null, undefined, true)
  const state = await startSession(site)
  if (state !== 'ok') {
    if (state === 'rejected') await tokenStore.remove(site.url)
    return showPicker(site, state === 'rejected' ? __('Please sign in again.') : undefined)
  }
  setActiveSite(site.url, accessToken)
  installFetch()
  setTokenRefreshedHandler((token) => {
    getSocket()?.setToken(token)
    setMediaSession(token)
  })
  setSessionLostHandler(async () => {
    await tokenStore.remove(site.url)
    await trimMediaCache(0)
    await clearOfflineData()
    window.location.replace('/')
  })
  await setMediaSession(accessToken())

  let boot: Boot
  let status: number | null = null
  try {
    const response = await fetch('/api/method/photos.api.native.boot')
    status = response.status
    if (!response.ok) throw new Error(String(response.status))
    boot = (await response.json()).message
    saveBoot(site.url, boot)
  } catch {
    const saved = (status === null || status >= 500) && (await savedBoot<Boot>(site.url))
    if (!saved) return showPicker(site, siteProblem(site.url, status ?? (await siteStatus(site.url))))
    boot = saved
    offline.value = status === null ? 'network' : 'site'
  }
  setCookie('user_id', boot.user)
  setCookie('full_name', boot.full_name)
  setCookie('user_image', boot.user_image)
  setCookie('system_user', boot.roles.includes('System Manager') ? 'yes' : 'no')
  window.csrf_token = boot.csrf_token
  rememberAccount({
    ...site,
    user: boot.user,
    fullName: boot.full_name,
    image: boot.user_image ? new URL(boot.user_image, site.url).href : null,
  })
  startSocket(
    { url: socketUrl(site.url, boot.socketio_port), namespace: boot.sitename, origin: site.url },
    accessToken,
  )
  watchExternalLinks()
  import('./back').then(({ watchBackButton }) => watchBackButton())
  import('./open').then(({ watchOpenLinks }) => watchOpenLinks())
  trimMediaCache()
  connectBackup(site, boot.user)
  return true
}

async function connectBackup(site: Site, user: string) {
  const { plugin } = await photosBackup()
  let running = false
  plugin.addListener('status', (status) => {
    if (running && !status.running) import('../data/uploads').then(({ notifyUploaded }) => notifyUploaded())
    running = status.running
  })
  const status = await plugin.getStatus().catch(() => null)
  if (!status) return
  if (status.signedIn && status.site === site.url && status.user === user) return
  await moveBackupHere(site, user)
}

export async function moveBackupHere(site: Site, user: string) {
  const { plugin } = await photosBackup()
  await plugin.signOut().catch(() => {})
  const response = await fetch('/api/method/photos.api.backup.device_token', { method: 'POST' })
  if (!response.ok) return
  const token = (await response.json()).message
  await plugin.configure({
    site: site.url,
    user,
    clientId: token.client_id,
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresIn: token.expires_in,
  })
}
