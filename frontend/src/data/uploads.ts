import { reactive } from 'vue'
import { toast } from 'frappe-ui'
import { addToAlbum } from '../resources/albums'
import { existingUploads, getUploadFolder, missingHashes } from '../resources/photos'
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
const failedTasks: Task[] = []
const HASH_LIMIT = 200 * 1024 * 1024

async function knownUploads(files: File[]) {
  const known = new Set(await existingUploads(files))
  if (!globalThis.crypto?.subtle) return known
  const pending = files
    .map((file, index) => ({ file, key: String(index) }))
    .filter(({ file, key }) => !known.has(key) && file.size <= HASH_LIMIT)
  const hashes: string[] = []
  for (const { file } of pending) {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-1', await file.arrayBuffer()))
    hashes.push([...digest].map((byte) => byte.toString(16).padStart(2, '0')).join(''))
  }
  if (!hashes.length) return known
  const missing = new Set(await missingHashes(hashes))
  pending.forEach(({ key }, index) => missing.has(hashes[index]) || known.add(key))
  return known
}
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
    failedTasks.length = 0
  }
  upload.open = true
  preparing++
  upload.preparing = !running
  const items = media.map((file) => reactive<UploadItem>({ name: file.name, size: file.size, status: 'waiting' }))
  upload.items.push(...items)
  upload.total += media.length
  const existing = await knownUploads(media).catch(() => new Set<string>())
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
        upload.bytes = before + file.size
      } catch (error) {
        fail(task, (error as Error).message)
        upload.bytes = before
      }
      upload.done++
      if (!--batch.left) batch.finish(batch.names)
      if (Date.now() - refreshed > REFRESH_MS) {
        refreshed = Date.now()
        notifyUploaded()
      }
    }
  } finally {
    for (const task of queue.splice(0)) {
      fail(task)
      upload.done++
      if (task.batch.left) (task.batch.finish(task.batch.names), (task.batch.left = 0))
    }
    running = false
    if (!preparing) finish()
  }
}

function fail(task: Task, error?: string) {
  task.item.status = 'failed'
  task.item.error = error || __('Upload failed. Try again.')
  upload.totalBytes -= task.file.size
  failedTasks.push(task)
}

export function retryFailed() {
  const tasks = failedTasks.splice(0)
  if (!tasks.length) return
  const batch: Batch = { names: [], left: tasks.length, finish: () => {} }
  for (const task of tasks) {
    Object.assign(task.item, { status: 'waiting', error: undefined })
    upload.totalBytes += task.file.size
    queue.push({ ...task, batch })
  }
  upload.done -= tasks.length
  Object.assign(upload, { active: true, open: true })
  if (!running) run()
}

function finish() {
  upload.active = false
  upload.preparing = false
  notifyUploaded()
}

export const MEDIA_TYPES = 'image/*,video/*,image/heic,image/heif,.heic,.heif'

export function chooseFiles(accept: string, onPick: (files: File[]) => void) {
  const input = document.createElement('input')
  input.type = 'file'
  input.multiple = true
  input.accept = accept
  input.hidden = true
  input.onchange = () => {
    input.remove()
    if (input.files?.length) onPick([...input.files])
  }
  input.oncancel = () => input.remove()
  document.body.append(input)
  input.click()
}

export function pickAndUpload(album?: string) {
  chooseFiles(MEDIA_TYPES, (files) => uploadPhotos(files, album))
}
