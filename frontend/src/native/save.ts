import { toast } from 'frappe-ui'

import { photosBackup } from './backup'
import { accessToken } from './session'
import { APP_HEADERS, siteUrl } from './site'

export async function saveFiles(files: { url: string; name?: string }[]) {
  const { plugin } = await photosBackup()
  let saved = 0
  let failure = ''
  for (const file of files) {
    try {
      await plugin.saveToDevice({
        url: siteUrl(file.url),
        name: file.name,
        headers: { ...APP_HEADERS, Authorization: `Bearer ${accessToken()}` },
      })
      saved++
    } catch (error) {
      failure ||= (error as Error).message
    }
  }
  const failed = files.length - saved
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
