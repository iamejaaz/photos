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
}

export interface Page {
  rows: Photo[]
  has_next: boolean
  next_start: number
}

export interface Album {
  name: string
  title: string
  cover: string | null
  count: number
  owner: string
  owner_name: string
  general: 'public' | 'site' | null
  shared: boolean
  shared_on?: string
  modified?: string
  latest?: string | null
  access?: { read: number; write: number; share: number; owner: number; download: number; upload: number }
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
const ALBUMS = 'photos.api.albums'
const DRIVE = 'suite.drive.api.files'
const CHUNK_SIZE = 20 * 1024 * 1024

const MEDIA = 'photos.api.media'
const inAlbum = (album?: string) => (album ? `&album=${encodeURIComponent(album)}` : '')
export const thumbnailUrl = (name: string, album?: string) =>
  album
    ? `/api/method/${MEDIA}.thumbnail?entity_name=${name}${inAlbum(album)}`
    : `/api/method/${DRIVE}.get_thumbnail?entity_name=${name}`
export const contentUrl = (name: string, album?: string) =>
  album
    ? `/api/method/${MEDIA}.content?entity_name=${name}${inAlbum(album)}`
    : `/api/method/${DRIVE}.get_file_content?entity_name=${name}`
export const streamUrl = (name: string, album?: string) =>
  album ? contentUrl(name, album) : `/api/method/${DRIVE}.stream_file_content?entity_name=${name}`
export const downloadUrl = (name: string, album?: string) =>
  album ? `${contentUrl(name, album)}&download=1` : `${contentUrl(name)}&trigger_download=1`
export const isVideo = (photo: Photo) => photo.mime_type?.startsWith('video/')

export const fetchPage = (method: string, params: Record<string, unknown>) =>
  call(method.includes('.') ? method : `${PHOTOS}.${method}`, params) as Promise<Page>

export const getDetails = (name: string, album?: string) =>
  call(`${PHOTOS}.get_details`, { name, album }) as Promise<any>
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
export const getUploadFolder = () => call(`${PHOTOS}.get_upload_folder`) as Promise<string>

export const ALBUM_PHOTOS = `${ALBUMS}.album_photos`
export const getAlbums = () => call(`${ALBUMS}.albums`) as Promise<Album[]>
export const getSharedAlbums = () => call(`${ALBUMS}.shared_albums`) as Promise<Album[]>
export const getAlbum = (album: string) => call(`${ALBUMS}.get_album`, { album }) as Promise<Album>
export const getAlbumFiles = (album: string) => call(`${ALBUMS}.album_files`, { album }) as Promise<string[]>
export const createAlbum = (title: string, files: string[] = []) =>
  call(`${ALBUMS}.create_album`, { title, files }) as Promise<string>
export const renameAlbum = (album: string, title: string) => call(`${ALBUMS}.rename_album`, { album, title })
export const setCover = (album: string, file: string) => call(`${ALBUMS}.set_cover`, { album, file })
export const deleteAlbum = (album: string) => call(`${ALBUMS}.delete_album`, { album })
export const leaveAlbum = (album: string) => call(`${ALBUMS}.leave_album`, { album })
export const addToAlbum = (album: string, files: string[]) => call(`${ALBUMS}.add_to_album`, { album, files })
export const removeFromAlbum = (album: string, files: string[]) =>
  call(`${ALBUMS}.remove_from_album`, { album, files })
export interface Activity {
  name: string
  type: 'Comment' | 'Like'
  file: string | null
  content: string | null
  owner: string
  full_name: string
  user_image: string | null
  creation: string
}
export const getActivity = (album: string) => call(`${ALBUMS}.activity`, { album }) as Promise<Activity[]>
export const addComment = (album: string, content: string, file?: string) =>
  call(`${ALBUMS}.add_comment`, { album, content, file })
export const toggleLike = (album: string, file?: string) =>
  call(`${ALBUMS}.toggle_like`, { album, file }) as Promise<boolean>
export const deleteActivity = (name: string) => call(`${ALBUMS}.delete_activity`, { name })
export interface Person {
  name: string
  person_name: string | null
  cover_face: string
  face_count: number
  hidden: number
}
export interface PhotoPerson {
  face: string
  person: string
  person_name: string | null
  timestamp: number | null
}
const PEOPLE = 'photos.api.people'
export const PERSON_PHOTOS = `${PEOPLE}.person_photos`
export const faceUrl = (face: string) => `/api/method/${PEOPLE}.face_thumbnail?face=${face}`
export const getPeople = (includeHidden = false) =>
  call(`${PEOPLE}.people`, { include_hidden: includeHidden }) as Promise<{
    enabled: boolean
    people: Person[]
  }>
export const getPerson = (person: string) => call(`${PEOPLE}.person`, { person }) as Promise<Person>
export const getPhotoPeople = (file: string, album?: string) =>
  call(`${PEOPLE}.photo_people`, { file, album }) as Promise<PhotoPerson[]>
export const moveFace = (face: string, person: string | null, personName?: string) =>
  call(`${PEOPLE}.move_face`, { face, person, person_name: personName })
export const markNotAFace = (face: string) => call(`${PEOPLE}.not_a_face`, { face })
export const unassignFace = (face: string) => call(`${PEOPLE}.remove_face`, { face })
export const renamePerson = (person: string, personName: string) =>
  call(`${PEOPLE}.rename_person`, { person, person_name: personName })
export const setPersonHidden = (person: string, hidden: boolean) =>
  call(`${PEOPLE}.set_hidden`, { person, hidden })
export const mergePeople = (target: string, sources: string[]) =>
  call(`${PEOPLE}.merge_people`, { target, sources })
export const removePhotosFromPerson = (person: string, files: string[]) =>
  call(`${PEOPLE}.remove_photos`, { person, files })

export type Feature = 'people' | 'places' | 'things'
export interface Settings extends Record<Feature, boolean> {
  status: string | null
  error: string | null
  can_manage: boolean
}
const SETTINGS = 'photos.api.settings'
export const getSettings = () => call(`${SETTINGS}.get_settings`) as Promise<Settings>
export const saveSettings = (values: Record<Feature, boolean>) =>
  call(`${SETTINGS}.save_settings`, values) as Promise<Settings>

export interface Preferences {
  memories: boolean
  memory_hidden_people: string[]
}
export const getPreferences = () => call('photos.api.preferences.get_preferences') as Promise<Preferences>
export const savePreferences = (values: Preferences) =>
  call('photos.api.preferences.save_preferences', values) as Promise<Preferences>

export interface PlaceMatch {
  label: string
  country: string
  latitude: number
  longitude: number
}
const EDIT = 'photos.api.edit'
export const editDate = (files: string[], values: { taken_on?: string; shift_minutes?: number }) =>
  call(`${EDIT}.edit_date`, { files, ...values })
export const editLocation = (files: string[], place: PlaceMatch | null) =>
  call(`${EDIT}.edit_location`, {
    files,
    latitude: place?.latitude ?? null,
    longitude: place?.longitude ?? null,
    place: place?.label ?? null,
  })
export const searchPlaces = (query: string) =>
  call(`${EDIT}.search_places`, { query }) as Promise<PlaceMatch[]>

const EXPORT = 'photos.api.export'
export const exportFiles = (files: string[], album?: string) =>
  call(`${EXPORT}.export_files`, { files, album })
export const exportAlbum = (album: string) => call(`${EXPORT}.export_album`, { album })
export const exportLibrary = () => call(`${EXPORT}.export_library`)

export interface ImportJob {
  name: string
  status: 'Reading' | 'Ready' | 'Importing' | 'Done' | 'Failed'
  summary: { albums: string[]; items: [number[], number, number, number, number][] } | null
  done: number
  total: number
  result: { imported: number; skipped: number; albums: number } | null
  error: string | null
}
export interface ImportOptions {
  mode: 'all' | 'some'
  albums: number[]
  years: number[]
  archived: boolean
  favourites: boolean
}
const TAKEOUT = 'photos.api.takeout'
export const createImport = (files: string[]) =>
  call(`${TAKEOUT}.create_import`, { files }) as Promise<ImportJob>
export const getImport = (name?: string) =>
  call(`${TAKEOUT}.get_import`, { name }) as Promise<ImportJob | null>
const HIDDEN = 'photos.api.hidden'
export const HIDDEN_PHOTOS = `${HIDDEN}.hidden_photos`
export const setHidden = (files: string[], hidden: boolean) => call(`${HIDDEN}.set_hidden`, { files, hidden })
export const hiddenState = () =>
  call(`${HIDDEN}.hidden_state`) as Promise<{ unlocked: boolean; count: number }>
export const unlockHidden = (password: string) => call(`${HIDDEN}.unlock`, { password })
export const lockHidden = () => call(`${HIDDEN}.lock`)

export interface LinkSettings {
  allow_uploads: number
  allow_download: number
  link_expires_on: string | null
  has_password: boolean
  public: boolean
}
export const albumGate = (album: string) =>
  call(`${ALBUMS}.album_gate`, { album }) as Promise<{ expired: boolean; locked: boolean }>
export const unlockAlbum = (album: string, password: string) =>
  call(`${ALBUMS}.unlock_album`, { album, password })
export const getLinkSettings = (album: string) =>
  call(`${ALBUMS}.get_link_settings`, { album }) as Promise<LinkSettings>
export const saveLinkSettings = (album: string, values: Record<string, unknown>) =>
  call(`${ALBUMS}.save_link_settings`, { album, ...values }) as Promise<LinkSettings>
export async function collectUpload(album: string, file: File, name?: string) {
  const form = new FormData()
  form.append('album', album)
  if (name) form.append('name', name)
  form.append('file', file, file.name)
  const response = await fetch('/api/method/photos.api.collect.upload', {
    method: 'POST',
    body: form,
    headers: { 'X-Frappe-CSRF-Token': window.csrf_token ?? '' },
  })
  if (!response.ok) throw new Error(await errorMessage(response))
}

export const startImport = (name: string, options: ImportOptions) =>
  call(`${TAKEOUT}.start_import`, { name, options }) as Promise<ImportJob>
export const cancelImport = (name: string) => call(`${TAKEOUT}.cancel_import`, { name })

export const createMovie = (files: string[], title: string, seconds: number, album?: string) =>
  call('photos.movies.create_movie', { files, title, seconds, album })

export const setFavourite = (names: string[], value: boolean) =>
  call(`${DRIVE}.set_favourite`, {
    entities: names.map((name) => ({ name, is_favourite: JSON.stringify(value) })),
  })
export const toggleTrash = (names: string[]) => call(`${DRIVE}.remove_or_restore`, { entity_names: names })
export const deleteForever = (names: string[]) => call(`${DRIVE}.delete_entities`, { entity_names: names })

export async function uploadFile(file: File, parent: string, onProgress: (loaded: number) => void) {
  const uuid = crypto.randomUUID()
  const total = Math.max(1, Math.ceil(file.size / CHUNK_SIZE))
  for (let index = 0; index < total; index++) {
    const offset = index * CHUNK_SIZE
    const form = new FormData()
    form.append('file', file.slice(offset, offset + CHUNK_SIZE), file.name)
    form.append('parent', parent)
    form.append('uuid', uuid)
    form.append('total_file_size', String(file.size))
    form.append('file_modified', String(file.lastModified))
    form.append('chunk_index', String(index))
    form.append('total_chunk_count', String(total))
    form.append('chunk_byte_offset', String(offset))
    const response = await fetch(`/api/method/${DRIVE}.upload_file`, {
      method: 'POST',
      body: form,
      headers: { 'X-Frappe-CSRF-Token': window.csrf_token ?? '' },
    })
    if (!response.ok) throw new Error(await errorMessage(response))
    onProgress(Math.min(file.size, offset + CHUNK_SIZE))
    if (index === total - 1) return ((await response.json()).message?.name as string | undefined) ?? null
  }
  return null
}

async function errorMessage(response: Response) {
  try {
    const body = await response.json()
    const messages = JSON.parse(body._server_messages || '[]')
    return messages.length ? JSON.parse(messages[0]).message : body.exception || response.statusText
  } catch {
    return response.statusText
  }
}
