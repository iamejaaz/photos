import { mediaSrc } from '../native/mediaUrl'
import { DRIVE } from './drive'
import { Photo } from './photos'

const MEDIA = 'photos.api.media'
const inAlbum = (album?: string) => (album ? `&album=${encodeURIComponent(album)}` : '')
export const mediaUrl = (url: string) => (import.meta.env.VITE_NATIVE ? mediaSrc(url) : url)
export const thumbnailUrl = (name: string, album?: string) =>
  mediaUrl(`/api/method/${MEDIA}.thumbnail?entity_name=${name}${inAlbum(album)}`)
export const contentUrl = (name: string, album?: string) =>
  mediaUrl(`/api/method/${MEDIA}.content?entity_name=${name}&display=1${inAlbum(album)}`)
export const streamUrl = contentUrl
export const downloadUrl = (name: string, album?: string) =>
  album
    ? `/api/method/${MEDIA}.content?entity_name=${name}&download=1${inAlbum(album)}`
    : `/api/method/${DRIVE}.get_file_content?entity_name=${name}&trigger_download=1`
export const liveUrl = (photo: Photo) =>
  photo.live_video
    ? contentUrl(photo.live_video, photo.album)
    : photo.motion_photo
      ? mediaUrl(`/api/method/${MEDIA}.content?entity_name=${photo.name}&motion=1${inAlbum(photo.album)}`)
      : null
