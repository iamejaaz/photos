import { siteOrigin, siteUrl } from './site'

export const safeFileName = (name: string) => name.replace(/[^\w.-]/g, '_').replace(/^\.+/, '')

export const mediaFolder = (path: string) => {
  const url = siteUrl(path)
  let hash = 5381
  for (let i = 0; i < url.length; i++) hash = ((hash * 33) ^ url.charCodeAt(i)) >>> 0
  const base = safeFileName(decodeURIComponent(url.split('?')[0].split('/').pop() ?? ''))
  return { folder: hash.toString(36), file: base || 'file' }
}

export const MEDIA_PATH = '/_photos_media_/'
const mediaBase = () =>
  typeof location !== 'undefined' && location.protocol === 'https:'
    ? `${location.origin}${MEDIA_PATH}`
    : 'photos-media://'

export const mediaSrc = (path: string): string => {
  const url = siteUrl(path)
  if (!url.startsWith(`${siteOrigin()}/`)) return url
  const { folder, file } = mediaFolder(url)
  return `${mediaBase()}${folder}/${file}?src=${encodeURIComponent(url)}`
}

export const mediaTarget = (src: string): string | null => {
  if (!src.startsWith('photos-media://') && !src.includes(MEDIA_PATH)) return null
  try {
    return new URL(src).searchParams.get('src')
  } catch {
    return null
  }
}
