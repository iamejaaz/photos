import { reactive } from 'vue'
import { toast } from 'frappe-ui'
import { addToAlbum } from '../resources/albums'
import { existingUploads, getUploadFolder } from '../resources/photos'
import { uploadFile } from '../resources/drive'
import { countLabel } from './actions'

export const upload = reactive({
  active: false,
  done: 0,
  total: 0,
  bytes: 0,
  totalBytes: 0,
})
const uploadListeners = new Set<() => void>()
export const notifyUploaded = () => uploadListeners.forEach((fn) => fn())
export const onUploaded = (fn: () => void) => {
  uploadListeners.add(fn)
  return () => uploadListeners.delete(fn)
}
export async function uploadPhotos(files: File[], album?: string): Promise<string[]> {
  let media = files.filter((file) => /^(image|video)\//.test(file.type))
  if (!media.length) {
    toast.warning(__('Only photos and videos can be added here'))
    return []
  }
  const existing = new Set(await existingUploads(media).catch(() => []))
  if (existing.size) {
    media = media.filter((_, index) => !existing.has(String(index)))
    toast.info(countLabel('1 item is already in Photos', '{0} items are already in Photos', existing.size))
    if (!media.length) return []
  }
  Object.assign(upload, {
    active: true,
    done: 0,
    total: media.length,
    bytes: 0,
    totalBytes: media.reduce((sum, file) => sum + file.size, 0),
  })
  let failed = 0
  const names: string[] = []
  try {
    const folder = await getUploadFolder()
    for (const file of media) {
      const before = upload.bytes
      try {
        const name = await uploadFile(file, folder, (loaded) => (upload.bytes = before + loaded))
        if (name) names.push(name)
      } catch (error) {
        failed++
        toast.error(`${file.name}: ${(error as Error).message}`)
      }
      upload.bytes = before + file.size
      upload.done++
    }
    if (album && names.length) await addToAlbum(album, names)
  } finally {
    upload.active = false
    notifyUploaded()
  }
  const added = media.length - failed
  if (added) toast.success(added === 1 ? __('1 item added') : __('{0} items added', [added]))
  return names
}
