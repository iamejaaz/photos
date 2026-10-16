import { ref } from 'vue'

import { withPrefs } from './platform'

export const offline = ref<false | 'network' | 'site'>(false)

const CACHE = 'photos-reads-v1'
const BOOT_KEY = 'offline-boot'
const UNAVAILABLE = new Set([502, 503, 504])

const READS = new Set([
  'photos.api.photos.timeline',
  'photos.api.photos.recently_added',
  'photos.api.photos.folders',
  'photos.api.photos.folder_photos',
  'photos.api.photos.favourites',
  'photos.api.photos.archived',
  'photos.api.photos.trash',
  'photos.api.photos.months',
  'photos.api.photos.memories',
  'photos.api.photos.places',
  'photos.api.photos.explore',
  'photos.api.photos.get_details',
  'photos.api.photos.photo_row',
  'photos.api.photos.duplicates',
  'photos.api.people.people',
  'photos.api.people.person',
  'photos.api.people.person_photos',
  'photos.api.people.photo_people',
  'photos.api.people.merge_suggestions',
  'photos.api.albums.albums',
  'photos.api.albums.shared_albums',
  'photos.api.albums.get_album',
  'photos.api.albums.album_photos',
  'photos.api.albums.activity',
  'photos.api.preferences.get_preferences',
  'photos.api.settings.get_settings',
  'suite.api.account.get_logged_in_user',
])

const methodOf = (url: string) => new URL(url).pathname.match(/^\/api\/method\/(.+)$/)?.[1] ?? ''

const keyFor = async (url: string, body: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body))
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `https://offline.photos/${encodeURIComponent(url)}/${hash}`
}

const store = () => (typeof caches === 'undefined' ? Promise.reject() : caches.open(CACHE))

export async function readThrough(url: string, body: string, send: () => Promise<Response>) {
  const read = READS.has(methodOf(url))
  const saved = async () =>
    read ? (await store()).match(await keyFor(url, body)).catch(() => undefined) : undefined
  let response: Response
  try {
    response = await send()
  } catch (error) {
    offline.value = 'network'
    const cached = await saved().catch(() => undefined)
    if (cached) return cached
    throw error
  }
  if (response.status < 500) offline.value = false
  if (read && response.ok) {
    const copy = response.clone()
    Promise.all([store(), keyFor(url, body)])
      .then(([cache, key]) => cache.put(key, copy))
      .catch(() => {})
  } else if (read && UNAVAILABLE.has(response.status)) {
    const cached = await saved().catch(() => undefined)
    if (cached) {
      offline.value = 'site'
      return cached
    }
  }
  return response
}

export const clearOfflineData = () =>
  Promise.all([
    typeof caches === 'undefined' ? null : caches.delete(CACHE).catch(() => false),
    withPrefs((p) => p.remove({ key: BOOT_KEY })),
  ])

export const saveBoot = (site: string, boot: unknown) =>
  withPrefs((p) => p.set({ key: BOOT_KEY, value: JSON.stringify({ site, boot }) })).catch(() => {})

export const savedBoot = async <T>(site: string): Promise<T | null> => {
  try {
    const { value } = await withPrefs((p) => p.get({ key: BOOT_KEY }))
    const parsed = value ? JSON.parse(value) : null
    return parsed?.site === site ? (parsed.boot as T) : null
  } catch {
    return null
  }
}
