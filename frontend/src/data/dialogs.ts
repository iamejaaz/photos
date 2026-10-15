import { reactive } from 'vue'
import { toast } from 'frappe-ui'
import { type Photo } from '../resources/photos'
import { type Settings, getSettings } from '../resources/settings'
import { lightbox } from './viewer'
import { clearSelection } from './selection'
import { notifyUploaded } from './uploads'
import { activeFeed } from './feed'

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
export const accountSheet = reactive({ open: false })
