import { computed, reactive, ref } from 'vue'
import { type Album, getAlbums, getSharedAlbums } from '../resources/albums'

export const albums = ref<Album[]>([])
export const sharedAlbums = ref<Album[]>([])
export const albumsStatus = ref<'loading' | 'ready' | 'failed'>('loading')
export const albumsLoaded = computed(() => albumsStatus.value === 'ready')
export async function loadAlbums() {
  try {
    ;[albums.value, sharedAlbums.value] = await Promise.all([getAlbums(), getSharedAlbums()])
    albumsStatus.value = 'ready'
  } catch (error) {
    if (albumsStatus.value !== 'ready') albumsStatus.value = 'failed'
    throw error
  }
}
export const albumPicker = reactive<{ open: boolean; files: string[] }>({
  open: false,
  files: [],
})
export function pickAlbumFor(files: string[]) {
  albumPicker.files = files
  albumPicker.open = true
}
