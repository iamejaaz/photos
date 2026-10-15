import { reactive, ref } from 'vue'
import { type Album, getAlbums, getSharedAlbums } from '../resources/albums'

export const albums = ref<Album[]>([])
export const sharedAlbums = ref<Album[]>([])
export const albumsLoaded = ref(false)
export async function loadAlbums() {
  ;[albums.value, sharedAlbums.value] = await Promise.all([getAlbums(), getSharedAlbums()])
  albumsLoaded.value = true
}
export const albumPicker = reactive<{ open: boolean; files: string[] }>({
  open: false,
  files: [],
})
export function pickAlbumFor(files: string[]) {
  albumPicker.files = files
  albumPicker.open = true
}
