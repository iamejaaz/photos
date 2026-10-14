import { toast } from 'frappe-ui'

import { photosBackup } from './backup'
import { accessToken } from './session'
import { APP_HEADERS, siteUrl } from './site'

export async function saveFiles(files: { url: string; name: string }[]) {
  const { plugin } = await photosBackup()
  let saved = 0
  for (const file of files) {
    try {
      await plugin.saveToDevice({
        url: siteUrl(file.url),
        name: file.name,
        headers: { ...APP_HEADERS, Authorization: `Bearer ${accessToken()}` },
      })
      saved++
    } catch (error) {
      toast.error(`${file.name}: ${(error as Error).message}`)
    }
  }
  if (saved)
    toast.success(saved === 1 ? __('Saved to your phone') : __('{0} items saved to your phone', [saved]))
}
