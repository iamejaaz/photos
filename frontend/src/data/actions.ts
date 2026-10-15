import { toast } from 'frappe-ui'
import { entitiesDownload } from '@/apps/drive/utils/download'
import { type Photo, setArchived } from '../resources/photos'
import { deleteForever, setFavourite, toggleTrash } from '../resources/drive'
import { downloadUrl } from '../resources/media'
import { setHidden } from '../resources/hidden'
import { activeFeed } from './feed'
import { selection } from './selection'

export async function toggleFavourite(photos: Photo[], value?: boolean) {
  const target = value ?? !photos.every((photo) => photo.is_favourite)
  await setFavourite(
    photos.map((photo) => photo.name),
    target,
  )
  photos.forEach((photo) => (photo.is_favourite = target ? photo.name : null))
  if (!target && activeFeed.value?.feed.method === 'favourites') {
    activeFeed.value.remove(photos.map((photo) => photo.name))
  }
}
function dropFromFeed(names: string[]) {
  activeFeed.value?.remove(names)
  names.forEach((name) => selection.delete(name))
}
export const countLabel = (one: string, many: string, count: number) =>
  count === 1 ? __(one) : __(many, [count])
function undoable(message: string, revert: () => Promise<unknown>) {
  const feed = activeFeed.value
  toast.success(message, {
    duration: 8000,
    action: {
      label: __('Undo'),
      onClick: async () => {
        await revert()
        feed?.reload()
      },
    },
  })
}
export async function trash(names: string[]) {
  await toggleTrash(names)
  dropFromFeed(names)
  undoable(countLabel('Moved to trash', '{0} items moved to trash', names.length), () => toggleTrash(names))
}
export async function restore(names: string[]) {
  await toggleTrash(names)
  dropFromFeed(names)
  toast.success(countLabel('Restored', '{0} items restored', names.length))
}
export async function removeForever(names: string[]) {
  await deleteForever(names)
  dropFromFeed(names)
  toast.success(countLabel('Deleted forever', '{0} items deleted forever', names.length))
}
export async function archive(names: string[], value = true) {
  await setArchived(names, value)
  dropFromFeed(names)
  undoable(
    value
      ? countLabel('Archived', '{0} items archived', names.length)
      : countLabel('Moved back to photos', '{0} items moved back to photos', names.length),
    () => setArchived(names, !value),
  )
}
export async function hide(names: string[], value = true) {
  await setHidden(names, value)
  dropFromFeed(names)
  toast.success(
    value
      ? countLabel('Hidden', '{0} items hidden', names.length)
      : countLabel('Moved back to photos', '{0} items moved back to photos', names.length),
  )
}
export const download = async (photos: Photo[]) => {
  if (!import.meta.env.VITE_NATIVE) return entitiesDownload(photos)
  const { saveFiles } = await import('../native/save')
  await saveFiles(
    photos.map((photo) => ({ url: downloadUrl(photo.name, photo.album), name: photo.file_name })),
  )
}
