<template>
  <PageHeader v-if="active" class="relative">
    <div v-if="selection.size" class="flex w-full items-center justify-between gap-2">
      <div class="flex items-center gap-2">
        <Button variant="ghost" :aria-label="__('Clear selection')" @click="clearSelection">
          <template #icon><LucideX class="size-4" /></template>
        </Button>
        <span class="text-base font-medium text-ink-gray-8">{{ __('{0} selected', [selection.size]) }}</span>
      </div>
      <div class="flex items-center gap-1">
        <Tooltip v-for="action in actions.filter((a) => !a.more)" :key="action.label" :text="action.label">
          <Button variant="ghost" :aria-label="action.label" @click="run(action)">
            <template #icon><component :is="action.icon" class="size-4" /></template>
          </Button>
        </Tooltip>
        <Dropdown v-if="moreActions.length" :options="moreActions">
          <Button variant="ghost" :aria-label="__('More')">
            <template #icon><LucideEllipsis class="size-4" /></template>
          </Button>
        </Dropdown>
      </div>
    </div>
    <template v-else>
      <div class="flex min-w-0 items-center gap-2">
        <slot name="title">
          <h1 class="truncate text-lg font-semibold text-ink-gray-9">{{ title }}</h1>
        </slot>
      </div>
      <div class="flex items-center gap-2">
        <form v-if="searchable" class="hidden sm:block" data-photos-search @submit.prevent="search">
          <TextInput v-model="query" class="w-72" :placeholder="__('Search people, places, things, dates')">
            <template #prefix><LucideSearch class="size-4 text-ink-gray-5" /></template>
          </TextInput>
        </form>
        <Button
          v-if="searchable && $route.name !== 'photos-search'"
          class="sm:hidden"
          variant="ghost"
          :aria-label="__('Search')"
          :route="{ name: 'photos-search' }"
        >
          <template #icon><LucideSearch class="size-4" /></template>
        </Button>
        <slot name="actions" />
        <template v-if="!hideUpload">
          <Button
            class="sm:hidden"
            variant="subtle"
            :loading="upload.active"
            :aria-label="__('Upload')"
            @click="pickFiles"
          >
            <template #icon><LucideUpload class="size-4" /></template>
          </Button>
          <Button class="max-sm:hidden" variant="subtle" :loading="upload.active" @click="pickFiles">
            <template #prefix><LucideUpload class="size-4" /></template>
            {{ upload.active ? __('Uploading {0} of {1}', [upload.done + 1, upload.total]) : __('Upload') }}
          </Button>
        </template>
        <button
          v-if="account && loggedIn"
          class="ml-1 rounded-full sm:hidden"
          :aria-label="__('Account')"
          @click="accountSheet.open = true"
        >
          <Avatar size="lg" :image="avatarImage" :label="fullName || __('Account')" />
        </button>
      </div>
    </template>
    <div
      v-if="upload.active"
      class="absolute bottom-0 left-0 h-0.5 bg-surface-gray-7 transition-all"
      :style="{ width: `${(upload.bytes / Math.max(upload.totalBytes, 1)) * 100}%` }"
    />
  </PageHeader>
  <Dialog
    v-model:open="confirmDelete"
    :title="__('Delete forever?')"
    :message="__('These items will be removed from Drive for good. This cannot be undone.')"
    icon="lucide-trash-2"
    theme="red"
    size="sm"
    :actions="[{ label: __('Delete forever'), variant: 'solid', theme: 'red', onClick: deleteSelected }]"
  />
</template>

<script setup lang="ts">
import { type Component, computed, onActivated, onDeactivated, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Avatar, Button, Dialog, Dropdown, PageHeader, TextInput, Tooltip, toast } from 'frappe-ui'
import LucideArchive from '~icons/lucide/archive'
import LucideArchiveRestore from '~icons/lucide/archive-restore'
import LucideCalendarClock from '~icons/lucide/calendar-clock'
import LucideClapperboard from '~icons/lucide/clapperboard'
import LucideDownload from '~icons/lucide/download'
import LucideEllipsis from '~icons/lucide/ellipsis'
import LucideEye from '~icons/lucide/eye'
import LucideEyeOff from '~icons/lucide/eye-off'
import LucideFileArchive from '~icons/lucide/file-archive'
import LucideImageDown from '~icons/lucide/image-down'
import LucideImageMinus from '~icons/lucide/image-minus'
import LucideImagePlay from '~icons/lucide/image-play'
import LucideImagePlus from '~icons/lucide/image-plus'
import LucideImageUp from '~icons/lucide/image-up'
import LucideLayoutGrid from '~icons/lucide/layout-grid'
import LucideMapPin from '~icons/lucide/map-pin'
import LucideRotateCcw from '~icons/lucide/rotate-ccw'
import LucideSearch from '~icons/lucide/search'
import LucideShare2 from '~icons/lucide/share-2'
import LucideStar from '~icons/lucide/star'
import LucideTrash2 from '~icons/lucide/trash-2'
import LucideUpload from '~icons/lucide/upload'
import LucideUserX from '~icons/lucide/user-x'
import LucideX from '~icons/lucide/x'

import { fullName, imageURL, useSessionStore } from '@/boot/session'
import { type Album } from '../resources/albums'
import { type Photo, getPhotoRow, isVideo, saveToLibrary } from '../resources/photos'
import { createAnimation } from '../resources/edit'
import { exportFiles } from '../resources/export'
import { activeFeed, createStaticFeed } from '../data/feed'
import { archive, download, hide, removeForever, restore, toggleFavourite, trash } from '../data/actions'
import { clearSelection, selection } from '../data/selection'
import { accountSheet, editMetadata, makeCollage, openShare, makeMovie } from '../data/dialogs'
import { mediaUrl } from '../resources/media'
import { startExport } from '../data/imports'
import { notifyUploaded, pickAndUpload, upload } from '../data/uploads'
import { openLightbox } from '../data/viewer'
import { pickAlbumFor } from '../data/albums'
import { errorText } from '../resources/drive'

type Mode = 'library' | 'album' | 'archive' | 'trash' | 'person' | 'hidden'
interface Action {
  label: string
  icon: Component
  keepSelection?: boolean
  more?: boolean
  run: (names: string[]) => unknown
}

const props = withDefaults(
  defineProps<{
    title?: string
    mode?: Mode
    album?: Album
    hideUpload?: boolean
    searchable?: boolean
    account?: boolean
  }>(),
  { mode: 'library' },
)
const emit = defineEmits<{
  'remove-from-album': [files: string[]]
  'set-cover': [file: string]
  'remove-from-person': [files: string[]]
}>()

const route = useRoute()
const router = useRouter()
const query = ref(String(route.query.q || ''))
watch(query, (value) => {
  if (!value.trim() && route.name === 'photos-search' && route.query.q) router.replace({ name: 'photos-search' })
})
const confirmDelete = ref(false)
const loggedIn = computed(() => useSessionStore().isLoggedIn)

const rowFor = (name: string) => (activeFeed.value?.feed.rows ?? []).find((row) => row.name === name) as Photo
const selected = () => (activeFeed.value?.feed.rows ?? []).filter((row) => selection.has(row.name))
const writable = () =>
  selected()
    .filter((row) => row.write)
    .map((row) => row.name)

const actions = computed<Action[]>(() => {
  const addToAlbum: Action = {
    label: __('Add to album'),
    icon: LucideImagePlus,
    keepSelection: true,
    run: (names) => pickAlbumFor(names),
  }
  const save: Action = { label: __('Download'), icon: LucideDownload, run: () => download(selected()) }
  const share: Action = {
    label: __('Share'),
    icon: LucideShare2,
    keepSelection: true,
    run: (names) => openShare(names.filter((name) => rowFor(name)?.write !== 0)),
  }
  const exportSelected: Action = {
    label: __('Export with dates and places'),
    icon: LucideFileArchive,
    more: true,
    run: (names) => startExport(() => exportFiles(names, props.album?.name)),
  }
  const favourite: Action = {
    label: __('Favourite'),
    icon: LucideStar,
    run: () => toggleFavourite(selected()),
  }
  const toTrash: Action = { label: __('Move to trash'), icon: LucideTrash2, run: () => trash(writable()) }
  const movie: Action = {
    label: __('Create movie'),
    icon: LucideClapperboard,
    keepSelection: true,
    more: true,
    run: (names) =>
      makeMovie(
        names.filter((name) => !isVideo(rowFor(name))),
        props.album?.name,
      ),
  }

  if (props.mode === 'trash')
    return [
      { label: __('Restore'), icon: LucideRotateCcw, run: restore },
      {
        label: __('Delete forever'),
        icon: LucideTrash2,
        keepSelection: true,
        run: () => (confirmDelete.value = true),
      },
    ]
  if (props.mode === 'person')
    return [
      share,
      favourite,
      addToAlbum,
      save,
      {
        label: __('Not this person'),
        icon: LucideUserX,
        run: (names) => emit('remove-from-person', names),
      },
      movie,
      toTrash,
    ]
  if (props.mode === 'hidden')
    return [{ label: __('Unhide'), icon: LucideEye, run: (names) => hide(names, false) }, save, toTrash]
  if (props.mode === 'archive')
    return [
      { label: __('Unarchive'), icon: LucideArchiveRestore, run: (names) => archive(names, false) },
      save,
      toTrash,
    ]
  if (props.mode === 'album') {
    const canDownload = props.album?.access?.download !== 0
    const list: Action[] = loggedIn.value
      ? [addToAlbum, ...(canDownload ? [save] : []), movie, ...(canDownload ? [exportSelected] : [])]
      : canDownload
        ? [save]
        : []
    if (loggedIn.value && !props.album?.access?.owner)
      list.push({
        label: __('Save to your photos'),
        icon: LucideImageDown,
        run: async (names) => {
          const saved = await saveToLibrary(names, props.album?.name)
          toast.success(
            saved.length === 1
              ? __('Saved to your photos')
              : __('{0} items saved to your photos', [saved.length]),
          )
        },
      })
    if (props.album?.access?.write) {
      list.push({
        label: __('Remove from album'),
        icon: LucideImageMinus,
        run: (names) => emit('remove-from-album', names),
      })
      if (selection.size === 1)
        list.push({
          label: __('Use as album cover'),
          icon: LucideImageUp,
          run: ([name]) => emit('set-cover', name),
        })
    }
    return list
  }
  return [
    share,
    favourite,
    addToAlbum,
    save,
    movie,
    {
      label: __('Create animation'),
      icon: LucideImagePlay,
      more: true,
      run: async (names) => {
        const photos = names.filter((name) => !isVideo(rowFor(name)))
        if (photos.length < 2) return toast.warning(__('Pick at least two photos for an animation'))
        try {
          const created = await createAnimation(photos.slice(0, 50), props.album?.name)
          notifyUploaded()
          toast.success(__('Animation saved to your photos'), {
            duration: 8000,
            action: {
              label: __('View'),
              onClick: async () => {
                const row = await getPhotoRow(created)
                if (row) openLightbox(createStaticFeed([row]), row.name)
              },
            },
          })
        } catch (error) {
          toast.error(errorText(error) || __('Could not create the animation'))
        }
      },
    },
    {
      label: __('Create collage'),
      icon: LucideLayoutGrid,
      keepSelection: true,
      more: true,
      run: (names) => makeCollage(names.filter((name) => !isVideo(rowFor(name)))),
    },
    {
      label: __('Edit date'),
      icon: LucideCalendarClock,
      keepSelection: true,
      more: true,
      run: () => editMetadata('date', writable()),
    },
    {
      label: __('Edit location'),
      icon: LucideMapPin,
      keepSelection: true,
      more: true,
      run: () => editMetadata('location', writable()),
    },
    exportSelected,
    {
      label: __('Hide'),
      icon: LucideEyeOff,
      more: true,
      run: () => hide(writable()),
    },
    { label: __('Archive'), icon: LucideArchive, run: (names) => archive(names) },
    toTrash,
  ]
})

const moreActions = computed(() =>
  actions.value
    .filter((action) => action.more)
    .map((action) => ({ label: action.label, icon: action.icon, onClick: () => run(action) })),
)

async function run(action: Action) {
  await action.run([...selection])
  if (!action.keepSelection) clearSelection()
}

async function deleteSelected() {
  confirmDelete.value = false
  await removeForever([...selection])
  clearSelection()
}

function search() {
  if (query.value.trim()) router.push({ name: 'photos-search', query: { q: query.value.trim() } })
}

const pickFiles = () => pickAndUpload(props.album?.name)

const active = ref(true)
onActivated(() => (active.value = true))
onDeactivated(() => (active.value = false))

const avatarImage = computed(() => (imageURL.value ? mediaUrl(imageURL.value) : undefined))
</script>
