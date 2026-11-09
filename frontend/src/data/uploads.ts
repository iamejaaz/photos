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
interface Task {
  file: File
  item: UploadItem
  album?: string
  batch: Batch
}
interface Batch {
  names: string[]
  left: number
  finish: (names: string[]) => void
}
const queue: Task[] = []
let refreshed = 0
let running = false
let preparing = 0

export async function uploadPhotos(files: File[], album?: string): Promise<string[]> {
  const media = files.filter((file) => /^(image|video)\//.test(file.type))
  if (!media.length) {
    toast.warning(__('Only photos and videos can be added here'))
    return []
  }
  if (!upload.active) {
    Object.assign(upload, { active: true, done: 0, total: 0, bytes: 0, totalBytes: 0, items: [] })
  }
  upload.open = true
  preparing++
  upload.preparing = !running
  const items = media.map((file) => reactive<UploadItem>({ name: file.name, size: file.size, status: 'waiting' }))
  upload.items.push(...items)
  upload.total += media.length
  const existing = new Set(await existingUploads(media).catch(() => []))
  const tasks = media
    .map((file, index) => ({ file, item: items[index], album }))
    .filter(({ item }, index) => {
      if (!existing.has(String(index))) return true
      item.status = 'skipped'
      return false
    })
  upload.totalBytes += tasks.reduce((sum, { file }) => sum + file.size, 0)
  preparing--
  const done = new Promise<string[]>((resolve) => {
    const batch: Batch = { names: [], left: tasks.length, finish: resolve }
    queue.push(...tasks.map((task) => ({ ...task, batch })))
    if (!tasks.length) resolve([])
  })
  if (!running && queue.length) run()
  else if (!running && !preparing) finish()
  return done
}

async function run() {
  running = true
  upload.preparing = false
  refreshed = Date.now()
  try {
    const folder = await getUploadFolder()
    let task: Task | undefined
    while ((task = queue.shift())) {
      const { file, item, album, batch } = task
      const before = upload.bytes
      item.status = 'uploading'
      try {
        const name = await uploadFile(file, folder, (loaded) => (upload.bytes = before + loaded))
        if (name) {
          batch.names.push(name)
          if (album) await addToAlbum(album, [name])
        }
        item.status = 'done'
      } catch (error) {
        item.status = 'failed'
        item.error = (error as Error).message
      }
      upload.bytes = before + file.size
      upload.done++
      if (!--batch.left) batch.finish(batch.names)
      if (Date.now() - refreshed > REFRESH_MS) {
        refreshed = Date.now()
        notifyUploaded()
      }
    }
  } finally {
    for (const { batch } of queue.splice(0)) if (batch.left) (batch.finish(batch.names), (batch.left = 0))
    running = false
    if (!preparing) finish()
  }
}

function finish() {
  upload.active = false
  upload.preparing = false
  notifyUploaded()
}

export function pickAndUpload(album?: string) {
  const input = document.createElement('input')
  input.type = 'file'
  input.multiple = true
  input.accept = 'image/*,video/*'
  input.onchange = () => input.files && uploadPhotos([...input.files], album)
  input.click()
}
