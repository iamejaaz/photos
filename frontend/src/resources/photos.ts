import { call } from 'frappe-ui'

export interface Photo {
  name: string
  file_name: string
  folder: string
  mime_type: string
  file_size: number
  taken: string
  width: number | null
  height: number | null
  duration: number | null
  camera: string | null
  latitude: number | null
  longitude: number | null
  is_favourite: string | null
  owner: string
  added_by?: string
  likes?: number
  liked?: boolean
  write?: number
  album?: string
  added?: string
  trashed_on?: string
  download?: number
  added_by_name?: string | null
  live_video?: string | null
  motion_photo?: number
}
export interface Page {
  rows: Photo[]
  has_next: boolean
  next_start: number
}
export interface Memory {
  year: number
  years_ago: number
  photos: Photo[]
}
export interface Place {
  place: string | null
  latitude: number
  longitude: number
  count: number
  cover: string
}
export interface MonthCount {
  year: number
  month: number
  count: number
}
const PHOTOS = 'photos.api.photos'
export const isVideo = (photo: Photo) => photo.mime_type?.startsWith('video/')
export const fetchPage = (method: string, params: Record<string, unknown>) =>
  call(method.includes('.') ? method : `${PHOTOS}.${method}`, params) as Promise<Page>
export const getDetails = (name: string, album?: string) =>
  call(`${PHOTOS}.get_details`, { name, album }) as Promise<any>
export const getPhotoRow = (name: string) => call(`${PHOTOS}.photo_row`, { name }) as Promise<Photo | null>
export const getMemories = () => call(`${PHOTOS}.memories`) as Promise<Memory[]>
export const getPlaces = () => call(`${PHOTOS}.places`) as Promise<Place[]>
export const getMonths = () => call(`${PHOTOS}.months`) as Promise<MonthCount[]>
export interface Folder {
  name: string
  title: string
  owner: string
  owner_name: string
  count: number
  cover: string | null
}
export const getFolders = () => call(`${PHOTOS}.folders`) as Promise<Folder[]>
export const getExplore = () =>
  call(`${PHOTOS}.explore`) as Promise<{
    places: Place[]
    things: { thing: string; count: number; cover: string }[]
    cameras: { camera: string; cover: string; count: number }[]
    videos: { count: number; cover: string | null }
  }>
export const setArchived = (files: string[], archived: boolean) =>
  call(`${PHOTOS}.set_archived`, { files, archived })
export const getLibraryFolder = () => call(`${PHOTOS}.library_folder`) as Promise<Record<string, unknown>>
export const saveToLibrary = (files: string[], album?: string) =>
  call(`${PHOTOS}.save_to_library`, { files, album }) as Promise<string[]>
export const existingUploads = (files: File[]) =>
  call(`${PHOTOS}.existing_uploads`, {
    items: files.map((file, index) => ({ key: String(index), name: file.name, size: file.size })),
  }) as Promise<string[]>
export const getUploadFolder = () => call(`${PHOTOS}.get_upload_folder`) as Promise<string>
