import { reactive } from 'vue'
import { toast } from 'frappe-ui'
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

const preparing: (string | number)[] = []

export async function startExport(run: () => Promise<unknown>) {
  try {
    await run()
    preparing.push(
      toast.loading(__('Preparing your download. It starts by itself when ready.'), { duration: Infinity }),
    )
  } catch (error) {
    toast.error(errorText(error) || __('Could not start the export'))
  }
}

export function exportProgress(done: number, total: number) {
  if (preparing[0] === undefined) return
  toast.loading(__('Preparing your download: {0} of {1}', [done, total]), {
    id: preparing[0],
    duration: Infinity,
  })
}

export function exportReady(file: string, title: string) {
  const url = `/api/method/suite.drive.api.files.get_file_content?entity_name=${file}&trigger_download=1`
  const save = () => {
    if (!import.meta.env.VITE_NATIVE) return window.location.assign(url)
    import('../native/save').then(({ saveFiles }) => saveFiles([{ url, name: `${title}.zip` }]))
  }
  const waiting = preparing.shift()
  if (waiting === undefined)
    return toast.success(__('{0} is ready', [title]), {
      duration: 30000,
      action: { label: __('Download'), onClick: save },
    })
  toast.dismiss(waiting)
  save()
}

export function exportFailed() {
  const waiting = preparing.shift()
  if (waiting !== undefined) toast.dismiss(waiting)
  toast.error(__('The download could not be prepared. Please try again.'))
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
