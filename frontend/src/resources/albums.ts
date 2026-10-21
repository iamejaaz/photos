import { call } from 'frappe-ui'
import { errorMessage } from './drive'
import { siteOrigin } from '../native/site'

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
  auto_people?: string[]
  auto_people_names?: string[]
  access?: { read: number; write: number; share: number; owner: number; download: number; upload: number }
}
const ALBUMS = 'photos.api.albums'
export const ALBUM_PHOTOS = `${ALBUMS}.album_photos`
export const createShareLink = (files: string[]) =>
  call(`${ALBUMS}.create_share_link`, { files }) as Promise<string>
export const setAutoPeople = (album: string, people: string[]) =>
  call(`${ALBUMS}.set_auto_people`, { album, people }) as Promise<number>
export const albumLink = (album: string) => `${siteOrigin()}/photos/albums/${album}`
export const getShareLinks = () => call(`${ALBUMS}.share_links`) as Promise<Album[]>
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
