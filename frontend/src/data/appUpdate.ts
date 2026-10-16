import { ref } from 'vue'
import { call, toast } from 'frappe-ui'

import { errorText } from '../resources/drive'

export type AppUpdate = { version_code: number; version_name: string; url: string }

export const appVersion = ref('')
export const availableUpdate = ref<AppUpdate | null>(null)
export const updateProgress = ref<number | null>(null)

const RECHECK_MS = 30 * 60_000
let checked: Promise<void> | undefined
let checkedAt = 0

if (import.meta.env.VITE_NATIVE)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - checkedAt > RECHECK_MS) {
      checked = undefined
      checkForUpdate()
    }
  })

export function checkForUpdate() {
  if (!import.meta.env.VITE_NATIVE) return Promise.resolve()
  return (checked ??= (async () => {
    checkedAt = Date.now()
    const { App } = await import('@capacitor/app')
    const [latest, info] = await Promise.all([
      (call('photos.api.native.app_update') as Promise<AppUpdate | null>).catch(() => null),
      App.getInfo(),
    ])
    appVersion.value = info.version
    if (latest && latest.version_code > Number(info.build)) availableUpdate.value = latest
  })())
}

export async function installUpdate() {
  if (!availableUpdate.value || updateProgress.value !== null) return
  const { photosShell } = await import('../native/shell')
  const { plugin } = await photosShell()
  const handle = await plugin.addListener('updateProgress', ({ percent }) => {
    updateProgress.value = Math.max(0, percent)
  })
  updateProgress.value = 0
  try {
    const result = await plugin.installUpdate({ url: availableUpdate.value.url })
    if (result?.needsPermission)
      toast.info(__('Allow Photos to install updates, then tap Update again.'), { duration: 8000 })
  } catch (error) {
    toast.error(errorText(error) || __('The update could not be downloaded'))
  } finally {
    updateProgress.value = null
    handle.remove()
  }
}
