import { reactive, ref, shallowRef, watch } from 'vue'
import { toast } from 'frappe-ui'

import { entitiesDownload } from '@/apps/drive/utils/download'
import { readString, writeString } from '@/utils/localStorage'
import {
  type Album,
  type Photo,
  type Settings,
  addToAlbum,
  deleteForever,
  fetchPage,
  getAlbums,
  getSettings,
  getSharedAlbums,
  getUploadFolder,
  setArchived,
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
  return handle
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

export const settings = reactive<{ open: boolean; data: Settings | null }>({ open: false, data: null })
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

export async function trash(names: string[]) {
  await toggleTrash(names)
  dropFromFeed(names)
  toast.success(countLabel('Moved to trash', '{0} items moved to trash', names.length))
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
  toast.success(
    value
      ? countLabel('Archived', '{0} items archived', names.length)
      : countLabel('Moved back to photos', '{0} items moved back to photos', names.length),
  )
}

export const download = (photos: Photo[]) => entitiesDownload(photos)

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
  const media = files.filter((file) => /^(image|video)\//.test(file.type))
  if (!media.length) {
    toast.warning(__('Only photos and videos can be added here'))
    return []
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
