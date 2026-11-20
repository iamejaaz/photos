import { toast } from 'frappe-ui'

import { photosBackup } from './backup'
import { accessToken } from './session'
import { APP_HEADERS, siteUrl } from './site'

const savingText = (index: number, total: number, percent: number) => {
  const label = total > 1 ? __('Saving {0} of {1} to your phone', [index, total]) : __('Saving to your phone')
  return percent >= 0 ? `${label} · ${percent}%` : label
}

export async function saveFiles(files: { url: string; name?: string }[]) {
  const { plugin } = await photosBackup()
  const total = files.length
  const progress = toast.loading(savingText(1, total, -1), {
    duration: Infinity,
  })
  const listener = await plugin.addListener('saveProgress', ({ index, percent }) => {
    toast.loading(savingText(index, total, percent), {
      id: progress,
      duration: Infinity,
    })
  })
  let saved = 0
  let failure = ''
  try {
    for (const [index, file] of files.entries()) {
      try {
        await plugin.saveToDevice({
          url: siteUrl(file.url),
          name: file.name,
          headers: { ...APP_HEADERS, Authorization: `Bearer ${accessToken()}` },
          index: index + 1,
          total,
        })
        saved++
      } catch (error) {
        failure ||= (error as Error).message
      }
    }
  } finally {
    listener.remove()
    toast.dismiss(progress)
  }
  const failed = total - saved
  if (failed)
    toast.error(
      failed === 1
        ? __('1 item could not be saved: {0}', [failure])
        : __('{0} items could not be saved: {1}', [failed, failure]),
    )
  if (saved)
    toast.success(saved === 1 ? __('Saved to your phone') : __('{0} items saved to your phone', [saved]))
}

export async function shareFiles(files: { url: string; name: string }[]) {
  const { plugin } = await photosBackup()
  await plugin.shareFiles({
    files: files.map((file) => ({ url: siteUrl(file.url), name: file.name })),
    headers: { ...APP_HEADERS, Authorization: `Bearer ${accessToken()}` },
  })
}
