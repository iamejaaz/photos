import { call } from 'frappe-ui'

import { photosShell } from './shell'

export async function screenLockAvailable() {
  const { plugin } = await photosShell()
  return (await plugin.screenLockAvailable().catch(() => ({ available: false }))).available
}

export async function unlockWithScreenLock(title: string) {
  const { plugin } = await photosShell()
  if (!(await plugin.confirmScreenLock({ title })).confirmed) return false
  await call('photos.api.hidden.unlock_in_app')
  return true
}
