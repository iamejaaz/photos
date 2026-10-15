import { call } from 'frappe-ui'

import { getSessionUser } from '@/boot/session'
import { photosShell } from './shell'
import { siteOrigin } from './site'

const HIDDEN = 'photos.api.hidden'
const key = () => `${siteOrigin()}|${getSessionUser()}`

export async function deviceUnlockStatus() {
  const { plugin } = await photosShell()
  return plugin.deviceUnlockStatus({ key: key() }).catch(() => ({ available: false, saved: false }))
}

export async function enableDeviceUnlock() {
  const secret = (await call(`${HIDDEN}.enable_device_unlock`)) as string
  const { plugin } = await photosShell()
  await plugin.saveUnlockSecret({ key: key(), secret })
}

export async function unlockWithDevice(title: string) {
  const { plugin } = await photosShell()
  const result = await plugin.readUnlockSecret({ key: key(), title })
  if (!result.secret) return false
  try {
    await call(`${HIDDEN}.unlock_with_device`, { secret: result.secret })
    return true
  } catch (error) {
    await plugin.forgetUnlockSecret({ key: key() })
    throw error
  }
}
