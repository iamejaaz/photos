import { reactive } from 'vue'
import { toast } from 'frappe-ui'
import { addToAlbum } from '../resources/albums'
import { existingUploads, getUploadFolder } from '../resources/photos'
import { uploadFile } from '../resources/drive'

export type UploadStatus = 'waiting' | 'uploading' | 'done' | 'failed' | 'skipped'
export interface UploadItem {
  name: string
  size: number
  status: UploadStatus
  error?: string
}
export const upload = reactive({
  active: false,
  preparing: false,
  done: 0,
  total: 0,
  bytes: 0,
  totalBytes: 0,
  items: [] as UploadItem[],
  open: false,
})
const uploadListeners = new Set<() => void>()
export const notifyUploaded = () => uploadListeners.forEach((fn) => fn())
export const onUploaded = (fn: () => void) => {
  uploadListeners.add(fn)
  return () => uploadListeners.delete(fn)
}
const REFRESH_MS = 2000
export async function uploadPhotos(files: File[], album?: string): Promise<string[]> {
  if (upload.active) {
    toast.info(__('Wait for the current upload to finish'))
    return []
  }
  let media = files.filter((file) => /^(image|video)\//.test(file.type))
  if (!media.length) {
    toast.warning(__('Only photos and videos can be added here'))
    return []
  }
  Object.assign(upload, {
    active: true,
    preparing: true,
    done: 0,
    total: media.length,
    bytes: 0,
    totalBytes: 0,
    items: media.map((file) => ({ name: file.name, size: file.size, status: 'waiting' })),
    open: true,
  })
  const names: string[] = []
  let refreshed = Date.now()
  try {
    const existing = new Set(await existingUploads(media).catch(() => []))
    const queue = media
      .map((file, index) => ({ file, item: upload.items[index] }))
      .filter(({ item }, index) => {
        if (!existing.has(String(index))) return true
        item.status = 'skipped'
        return false
      })
    upload.totalBytes = queue.reduce((sum, { file }) => sum + file.size, 0)
    upload.preparing = false
    if (!queue.length) return []
    const folder = await getUploadFolder()
    for (const { file, item } of queue) {
      const before = upload.bytes
      item.status = 'uploading'
      try {
        const name = await uploadFile(file, folder, (loaded) => (upload.bytes = before + loaded))
        if (name) {
          names.push(name)
          if (album) await addToAlbum(album, [name])
        }
        item.status = 'done'
      } catch (error) {
        item.status = 'failed'
        item.error = (error as Error).message
      }
      upload.bytes = before + file.size
      upload.done++
      if (Date.now() - refreshed > REFRESH_MS) {
        refreshed = Date.now()
        notifyUploaded()
      }
    }
  } finally {
    upload.active = false
    upload.preparing = false
    notifyUploaded()
  }
  return names
}
export function pickAndUpload(album?: string) {
  const input = document.createElement('input')
  input.type = 'file'
  input.multiple = true
  input.accept = 'image/*,video/*'
  input.onchange = () => input.files && uploadPhotos([...input.files], album)
  input.click()
}
