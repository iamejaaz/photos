import { ref, watch } from 'vue'
import { readString, writeString } from '@/utils/localStorage'
import { sharedAlbums } from './albums'

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
export const zoom = ref(Number(readString('photos-zoom', '1')) || 1)
watch(zoom, (value) => writeString('photos-zoom', String(value)))
export function changeZoom(step: number) {
  zoom.value = Math.min(1.8, Math.max(0.5, Math.round((zoom.value + step) * 10) / 10))
}
