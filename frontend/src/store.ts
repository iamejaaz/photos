import { reactive, ref, shallowRef, watch } from 'vue'
import { toast } from 'frappe-ui'

import { entitiesDownload } from '@/apps/drive/utils/download'
import { readString, writeString } from '@/utils/localStorage'
import {
  type Album,
  type Memory,
  type Photo,
  type Settings,
  addToAlbum,
  deleteForever,
  downloadUrl,
  fetchPage,
  getAlbums,
  getSettings,
  getSharedAlbums,
  type ImportJob,
  type ImportOptions,
  cancelImport,
  createImport,
  getImport,
  startImport,
  existingUploads,
  getUploadFolder,
  setArchived,
  setHidden,
  setFavourite,
  toggleTrash,
  uploadFile,
} from './api'

export interface Feed {
  method: string
  params: Record<string, unknown>
  rows: Photo[]
  nextStart: number
  hasNext: boolean
  loading: boolean
  loaded: boolean
  error: string | null
}

export function createFeed(method: string, params: Record<string, unknown> = {}) {
  const feed = reactive<Feed>({
    method,
    params,
    rows: [],
    nextStart: 0,
    hasNext: true,
    loading: false,
    loaded: false,
    error: null,
  })

  async function loadMore() {
    if (feed.loading || !feed.hasNext) return
    feed.loading = true
    try {
      const page = await fetchPage(feed.method, {
        ...feed.params,
        start: feed.nextStart,
      })
      const known = new Set(feed.rows.map((row) => row.name))
      feed.rows.push(...page.rows.filter((row) => !known.has(row.name)))
      feed.nextStart = page.next_start
      feed.hasNext = page.has_next
      feed.error = null
    } catch (error) {
      feed.error = (error as Error).message
      feed.hasNext = false
    } finally {
      feed.loading = false
      feed.loaded = true
    }
  }

  async function reload() {
    feed.rows = []
    feed.nextStart = 0
    feed.hasNext = true
    await loadMore()
  }

  function remove(names: string[]) {
    const gone = new Set(names)
    feed.rows = feed.rows.filter((row) => !gone.has(row.name))
  }

  return { feed, loadMore, reload, remove }
}

export function createStaticFeed(rows: Photo[]) {
  const handle = createFeed('static')
  Object.assign(handle.feed, { rows, hasNext: false, loaded: true })
  return { ...handle, reload: async () => {} }
}

export type FeedHandle = ReturnType<typeof createFeed>

export const activeFeed = shallowRef<FeedHandle | null>(null)

export const selection = reactive(new Set<string>())
export const clearSelection = () => selection.clear()

export const lightbox = reactive<{
  open: boolean
  index: number
  showInfo: boolean
  slideshow: boolean
}>({
  open: false,
  index: 0,
  showInfo: false,
  slideshow: false,
})

export function openLightbox(feed: FeedHandle, name: string, slideshow = false) {
  activeFeed.value = feed
  lightbox.index = feed.feed.rows.findIndex((row) => row.name === name)
  lightbox.slideshow = slideshow
  lightbox.open = lightbox.index > -1
}

const RECENT_KEY = 'photos-recent-searches'
const readRecent = () => {
  try {
    return JSON.parse(readString(RECENT_KEY, '[]')) as string[]
  } catch {
    return []
  }
}
export const recentSearches = ref<string[]>(readRecent())
export function rememberSearch(term: string) {
  const value = term.trim()
  if (!value) return
  recentSearches.value = [
    value,
    ...recentSearches.value.filter((item) => item.toLowerCase() !== value.toLowerCase()),
  ].slice(0, 8)
  writeString(RECENT_KEY, JSON.stringify(recentSearches.value))
}
export function clearRecentSearches() {
  recentSearches.value = []
  writeString(RECENT_KEY, '[]')
}

export const sharingSeen = ref(readString('photos-sharing-seen', ''))
export function markSharingSeen() {
  const latest = sharedAlbums.value.reduce(
    (max, album) => (album.shared_on && album.shared_on > max ? album.shared_on : max),
    '',
  )
  if (latest <= sharingSeen.value) return
  sharingSeen.value = latest
  writeString('photos-sharing-seen', latest)
}

export const albums = ref<Album[]>([])
export const sharedAlbums = ref<Album[]>([])
export const albumsLoaded = ref(false)
export async function loadAlbums() {
  ;[albums.value, sharedAlbums.value] = await Promise.all([getAlbums(), getSharedAlbums()])
  albumsLoaded.value = true
}

export const zoom = ref(Number(readString('photos-zoom', '1')) || 1)
watch(zoom, (value) => writeString('photos-zoom', String(value)))
export function changeZoom(step: number) {
  zoom.value = Math.min(1.8, Math.max(0.5, Math.round((zoom.value + step) * 10) / 10))
}

export const collage = reactive<{ open: boolean; files: string[] }>({ open: false, files: [] })
export function makeCollage(files: string[]) {
  if (files.length < 2 || files.length > 9) {
    toast.warning(__('Pick 2 to 9 photos for a collage'))
    return
  }
  collage.files = files
  collage.open = true
}

export const libraryShare = reactive({ open: false })

export const sharePhotos = reactive<{ open: boolean; files: string[] }>({ open: false, files: [] })
export function openShare(files: string[]) {
  sharePhotos.files = files
  sharePhotos.open = true
}

export async function startExport(run: () => Promise<unknown>) {
  try {
    await run()
    toast.info(__('Preparing your export. You will get a message when it is ready.'))
  } catch (error) {
    toast.error((error as { messages?: string[] }).messages?.[0] ?? __('Could not start the export'))
  }
}
export const memoriesVersion = ref(0)
export const memoryStory = reactive<{ open: boolean; memories: Memory[]; memory: number; index: number }>({
  open: false,
  memories: [],
  memory: 0,
  index: 0,
})
export function playMemories(memories: Memory[], start: number) {
  Object.assign(memoryStory, {
    memories: memories.map((memory) => ({ ...memory, photos: [...memory.photos].reverse() })),
    memory: start,
    index: 0,
    open: true,
  })
}

export const editing = reactive<{ kind: 'date' | 'location' | null; files: string[]; version: number }>({
  kind: null,
  files: [],
  version: 0,
})
export function editMetadata(kind: 'date' | 'location', files: string[]) {
  editing.files = files
  editing.kind = kind
}
export function metadataSaved(taken?: (photo: Photo) => string) {
  editing.kind = null
  editing.version++
  if (!lightbox.open) {
    clearSelection()
    notifyUploaded()
    return
  }
  if (taken)
    activeFeed.value?.feed.rows
      .filter((row) => editing.files.includes(row.name))
      .forEach((row) => (row.taken = taken(row)))
}

export const settings = reactive<{ open: boolean; tab: string; data: Settings | null }>({
  open: false,
  tab: 'import',
  data: null,
})
export function openSettings(tab = 'import') {
  settings.tab = tab
  settings.open = true
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
    takeout.error = (error as { messages?: string[] }).messages?.[0] ?? (error as Error).message
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
export async function loadSettings() {
  settings.data = await getSettings()
}

export const movie = reactive<{ open: boolean; files: string[]; album?: string }>({ open: false, files: [] })
export function makeMovie(files: string[], album?: string) {
  if (files.length < 2) {
    toast.warning(__('Pick at least two photos for a movie'))
    return
  }
  movie.files = files
  movie.album = album
  movie.open = true
}

export const albumPicker = reactive<{ open: boolean; files: string[] }>({
  open: false,
  files: [],
})
export function pickAlbumFor(files: string[]) {
  albumPicker.files = files
  albumPicker.open = true
}

export async function toggleFavourite(photos: Photo[], value?: boolean) {
  const target = value ?? !photos.every((photo) => photo.is_favourite)
  await setFavourite(
    photos.map((photo) => photo.name),
    target,
  )
  photos.forEach((photo) => (photo.is_favourite = target ? photo.name : null))
  if (!target && activeFeed.value?.feed.method === 'favourites') {
    activeFeed.value.remove(photos.map((photo) => photo.name))
  }
}

function dropFromFeed(names: string[]) {
  activeFeed.value?.remove(names)
  names.forEach((name) => selection.delete(name))
}

const countLabel = (one: string, many: string, count: number) => (count === 1 ? __(one) : __(many, [count]))

function undoable(message: string, revert: () => Promise<unknown>) {
  const feed = activeFeed.value
  toast.success(message, {
    duration: 8000,
    action: {
      label: __('Undo'),
      onClick: async () => {
        await revert()
        feed?.reload()
      },
    },
  })
}

export async function trash(names: string[]) {
  await toggleTrash(names)
  dropFromFeed(names)
  undoable(countLabel('Moved to trash', '{0} items moved to trash', names.length), () => toggleTrash(names))
}

export async function restore(names: string[]) {
  await toggleTrash(names)
  dropFromFeed(names)
  toast.success(countLabel('Restored', '{0} items restored', names.length))
}

export async function removeForever(names: string[]) {
  await deleteForever(names)
  dropFromFeed(names)
  toast.success(countLabel('Deleted forever', '{0} items deleted forever', names.length))
}

export async function archive(names: string[], value = true) {
  await setArchived(names, value)
  dropFromFeed(names)
  undoable(
    value
      ? countLabel('Archived', '{0} items archived', names.length)
      : countLabel('Moved back to photos', '{0} items moved back to photos', names.length),
    () => setArchived(names, !value),
  )
}

export async function hide(names: string[], value = true) {
  await setHidden(names, value)
  dropFromFeed(names)
  toast.success(
    value
      ? countLabel('Hidden', '{0} items hidden', names.length)
      : countLabel('Moved back to photos', '{0} items moved back to photos', names.length),
  )
}

export const download = async (photos: Photo[]) => {
  if (!import.meta.env.VITE_NATIVE) return entitiesDownload(photos)
  const { saveFiles } = await import('./native/save')
  await saveFiles(
    photos.map((photo) => ({ url: downloadUrl(photo.name, photo.album), name: photo.file_name })),
  )
}

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
