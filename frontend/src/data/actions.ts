import { toast } from 'frappe-ui'
import { type Photo, setArchived } from '../resources/photos'
import { deleteForever, setFavourite, toggleTrash } from '../resources/drive'
import { downloadUrl } from '../resources/media'
import { setHidden } from '../resources/hidden'
import { undoMerge } from '../resources/people'
import { exportFiles } from '../resources/export'
import { startExport } from './imports'
import { type FeedHandle, activeFeed } from './feed'
import { lightbox, openLightbox } from './viewer'
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
const UNDO_TOAST = 'photos-undo'
interface Removal {
  key: string
  feed: FeedHandle | null
  names: string[]
  steps: { row: Photo; index: number }[][]
  viewing: boolean
}
let lastRemoval: Removal | null = null

function removeWithUndo(
  key: string,
  names: string[],
  label: (count: number) => string,
  revert: (names: string[]) => Promise<unknown>,
) {
  const feed = activeFeed.value
  const wanted = new Set(names)
  const step = (feed?.feed.rows ?? []).flatMap((row, index) => (wanted.has(row.name) ? [{ row, index }] : []))
  dropFromFeed(names)
  if (lastRemoval?.key === key && lastRemoval.feed === feed) {
    lastRemoval.names.push(...names)
    lastRemoval.steps.push(step)
  } else lastRemoval = { key, feed, names: [...names], steps: [step], viewing: lightbox.open }
  if (lightbox.open) lastRemoval.viewing = true
  const removal = lastRemoval
  const forget = () => lastRemoval === removal && (lastRemoval = null)
  toast.success(label(removal.names.length), {
    id: UNDO_TOAST,
    duration: 8000,
    onAutoClose: forget,
    onDismiss: forget,
    action: {
      label: __('Undo'),
      onClick: async () => {
        forget()
        await revert(removal.names)
        putBack(removal)
        const last = removal.names[removal.names.length - 1]
        if (removal.viewing && removal.feed) openLightbox(removal.feed, last)
        toast.success(countLabel('Restored', '{0} items restored', removal.names.length), { id: UNDO_TOAST })
      },
    },
  })
}
function putBack(removal: Removal) {
  const rows = removal.feed?.feed.rows
  if (!rows) return
  for (const step of [...removal.steps].reverse()) {
    for (const { row, index } of step) rows.splice(Math.min(index, rows.length), 0, row)
  }
}
export function mergedToast(token: string | undefined, afterUndo: () => unknown) {
  toast.success(__('Merged'), {
    id: UNDO_TOAST,
    duration: 10000,
    action: token
      ? {
          label: __('Undo'),
          onClick: async () => {
            await undoMerge(token)
            await afterUndo()
            toast.success(__('Merge undone'), { id: UNDO_TOAST })
          },
        }
      : undefined,
  })
}
export async function trash(names: string[]) {
  await toggleTrash(names)
  removeWithUndo(
    'trash',
    names,
    (count) => countLabel('Moved to trash', '{0} items moved to trash', count),
    toggleTrash,
  )
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
  removeWithUndo(
    `archive:${value}`,
    names,
    (count) =>
      value
        ? countLabel('Archived', '{0} items archived', count)
        : countLabel('Moved back to photos', '{0} items moved back to photos', count),
    (all) => setArchived(all, !value),
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
  if (!import.meta.env.VITE_NATIVE) {
    if (photos.length === 1) return window.location.assign(downloadUrl(photos[0].name, photos[0].album))
    return startExport(() =>
      exportFiles(
        photos.map((photo) => photo.name),
        photos[0]?.album,
      ),
    )
  }
  const { saveFiles } = await import('../native/save')
  await saveFiles(
    photos.map((photo) => ({ url: downloadUrl(photo.name, photo.album), name: photo.file_name })),
  )
}
