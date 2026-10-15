import { createApp } from 'vue'

import { translationPlugin } from '@/boot/translation'

import { tokenStore } from './auth'
import { photosBackup } from './backup'
import { installFetch } from './http'
import { watchExternalLinks } from './links'
import { setMediaSession, trimMediaCache } from './media'
import { accessToken, setSessionLostHandler, setTokenRefreshedHandler, startSession } from './session'
import { setActiveSite } from './site'
import { getSocket, startSocket } from './socket'
import SitePicker from './SitePicker.vue'
import { type Site, savedSite } from './sites'

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

const showPicker = (site?: Site | null, notice?: string) => {
  createApp(SitePicker, { site, notice }).use(translationPlugin).mount('#app')
  import('./splash').then(({ hideSplash }) => hideSplash())
  return false
}

export async function startNative(): Promise<boolean> {
  document.documentElement.classList.add('native')
  const site = await savedSite()
  if (!site) return showPicker()
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
    window.location.replace('/')
  })
  await setMediaSession(accessToken())

  let boot: Boot
  try {
    const response = await fetch('/api/method/photos.api.native.boot')
    if (!response.ok) throw new Error(String(response.status))
    boot = (await response.json()).message
  } catch {
    return showPicker(site, __('Could not reach {0}. Check your connection and try again.', [site.url]))
  }
  setCookie('user_id', boot.user)
  setCookie('full_name', boot.full_name)
  setCookie('user_image', boot.user_image)
  setCookie('system_user', boot.roles.includes('System Manager') ? 'yes' : 'no')
  window.csrf_token = boot.csrf_token
  startSocket(
    { url: socketUrl(site.url, boot.socketio_port), namespace: boot.sitename, origin: site.url },
    accessToken,
  )
  watchExternalLinks()
  import('./back').then(({ watchBackButton }) => watchBackButton())
  trimMediaCache()
  connectBackup(site, boot.user)
  return true
}

async function connectBackup(site: Site, user: string) {
  const { plugin } = await photosBackup()
  let running = false
  plugin.addListener('status', (status) => {
    if (running && !status.running) import('../store').then(({ notifyUploaded }) => notifyUploaded())
    running = status.running
  })
  const status = await plugin.getStatus().catch(() => null)
  if (!status) return
  if (status.signedIn && status.site === site.url && status.user === user) return
  if (status.signedIn) await plugin.signOut()
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
