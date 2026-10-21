import { reactive } from 'vue'
import { call, toast } from 'frappe-ui'
import {
  type ImportJob,
  type ImportOptions,
  cancelImport,
  createImport,
  getImport,
  startImport,
} from '../resources/takeout'
import { getUploadFolder } from '../resources/photos'
import { uploadFile, errorText } from '../resources/drive'
import { notifyUploaded } from './uploads'
import { loadAlbums } from './albums'

type ExportState = { title: string; done: number; total: number }

const STARTED_KEY = 'photos-exports-started'
const preparing = new Map<string, string | number>()

const startedHere = (): string[] => {
  try {
    return JSON.parse(sessionStorage.getItem(STARTED_KEY) || '[]')
  } catch {
    return []
  }
}
const rememberStarted = () => {
  try {
    sessionStorage.setItem(STARTED_KEY, JSON.stringify([...preparing.keys()]))
  } catch {}
}

const showPreparing = (id: string, done?: number, total?: number) => {
  const message = total
    ? __('Preparing your download: {0} of {1}', [done ?? 0, total])
    : __('Preparing your download. It starts by itself when ready.')
  preparing.set(id, toast.loading(message, { id: preparing.get(id), duration: Infinity }))
  rememberStarted()
}

export async function startExport(run: () => Promise<{ id: string }>) {
  try {
    const { id } = await run()
    if (preparing.has(id)) return toast.info(__('This download is already being prepared'))
    showPreparing(id)
  } catch (error) {
    toast.error(errorText(error) || __('Could not start the export'))
  }
}

export async function resumeExports() {
  const started = startedHere()
  if (!started.length) return
  const running = (await call('photos.api.export.active_exports').catch(() => ({}))) as Record<
    string,
    ExportState
  >
  for (const id of started) if (running[id]) showPreparing(id, running[id].done, running[id].total)
  rememberStarted()
}

export function exportProgress(id: string, done: number, total: number) {
  if (preparing.has(id)) showPreparing(id, done, total)
}

const takeDownload = (id: string) => {
  const waiting = preparing.get(id)
  if (waiting !== undefined) toast.dismiss(waiting)
  preparing.delete(id)
  rememberStarted()
  return waiting !== undefined
}

export function exportReady(id: string, token: string, title: string) {
  const url = `/api/method/suite.drive.api.files.download_archive?token=${encodeURIComponent(token)}`
  const save = () => {
    if (!import.meta.env.VITE_NATIVE) return window.location.assign(url)
    import('../native/save').then(({ saveFiles }) => saveFiles([{ url, name: title }]))
  }
  if (takeDownload(id)) return save()
  toast.success(__('{0} is ready', [title]), {
    duration: 30000,
    action: { label: __('Download'), onClick: save },
  })
}

export function exportFailed(id: string) {
  if (takeDownload(id)) toast.error(__('The download could not be prepared. Please try again.'))
}
export const takeout = reactive({
  uploading: false,
  parts: 0,
  uploaded: 0,
  bytes: 0,
  totalBytes: 0,
  job: null as ImportJob | null,
  error: '',
})
export const googleImport = reactive<{
  picking: boolean
  running: boolean
  done: number
  total: number
}>({ picking: false, running: false, done: 0, total: 0 })
export async function loadImport(name?: string) {
  const job = await getImport(name)
  const finished = takeout.job?.status === 'Importing' && job?.status === 'Done'
  takeout.job = job
  if (finished) {
    notifyUploaded()
    loadAlbums()
  }
  return job
}
export async function startTakeout(files: File[]) {
  const zips = files.filter((file) => file.name.toLowerCase().endsWith('.zip'))
  if (!zips.length) {
    toast.warning(__('Pick the .zip files from Google Takeout'))
    return
  }
  Object.assign(takeout, {
    uploading: true,
    parts: zips.length,
    uploaded: 0,
    bytes: 0,
    totalBytes: zips.reduce((sum, file) => sum + file.size, 0),
    error: '',
  })
  try {
    const folder = await getUploadFolder()
    const names: string[] = []
    for (const file of zips) {
      const before = takeout.bytes
      const name = await uploadFile(file, folder, (loaded) => (takeout.bytes = before + loaded))
      if (name) names.push(name)
      takeout.uploaded++
    }
    takeout.job = await createImport(names)
  } catch (error) {
    takeout.error = errorText(error)
  } finally {
    takeout.uploading = false
  }
}
export async function runImport(options: ImportOptions) {
  if (takeout.job) takeout.job = await startImport(takeout.job.name, options)
}
export async function discardImport() {
  if (takeout.job && ['Ready', 'Failed'].includes(takeout.job.status)) await cancelImport(takeout.job.name)
  takeout.job = null
  takeout.error = ''
}
