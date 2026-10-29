<template>
  <PhotosHeader
    mode="album"
    :album="album ?? undefined"
    hide-upload
    @remove-from-album="removeItems"
    @set-cover="useAsCover"
  >
    <template #title>
      <template v-if="loggedIn">
        <router-link
          :to="{ name: album?.access?.owner ? 'photos-albums' : 'photos-sharing' }"
          class="hidden text-lg font-semibold text-ink-gray-5 hover:text-ink-gray-8 sm:inline"
        >
          {{ album?.access?.owner ? __('Albums') : __('Sharing') }}
        </router-link>
        <LucideChevronRight class="hidden size-4 shrink-0 text-ink-gray-4 sm:block" />
      </template>
      <h1 class="truncate text-lg font-semibold text-ink-gray-9">{{ album?.title }}</h1>
      <span v-if="album && !album.access?.owner" class="hidden truncate text-sm text-ink-gray-5 sm:inline">
        {{ __('by {0}', [album.owner_name]) }}
      </span>
      <span v-if="album?.auto_people_names?.length" class="hidden truncate text-sm text-ink-gray-5 sm:inline">
        {{ __('Adds {0} automatically', [album.auto_people_names.join(', ')]) }}
      </span>
    </template>
    <template #actions>
      <Button
        v-if="album?.access?.write"
        :variant="found ? 'subtle' : 'solid'"
        :aria-label="__('Add photos')"
        @click="adding = true"
      >
        <template #[iconSlot]><LucideImagePlus class="size-4" /></template>
        <template v-if="!phone">{{ __('Add photos') }}</template>
      </Button>
      <Button
        v-if="album?.access?.upload && !album.access.write"
        :variant="found ? 'subtle' : 'solid'"
        :loading="contributing"
        :aria-label="__('Add photos')"
        @click="contribute"
      >
        <template #[iconSlot]><LucideImagePlus class="size-4" /></template>
        <template v-if="!phone">{{ __('Add photos') }}</template>
      </Button>
      <Button
        v-if="album?.find_me && !found"
        variant="subtle"
        :loading="finding"
        :aria-label="__('Find me')"
        @click="startFindMe"
      >
        <template #[iconSlot]><LucideScanFace class="size-4" /></template>
        <template v-if="!phone">{{ __('Find me') }}</template>
      </Button>
      <input
        ref="selfieInput"
        type="file"
        accept="image/*"
        capture="user"
        class="hidden"
        @change="onSelfie"
      />
      <SelfieCamera v-model:open="camera" @taken="search" />
      <Button v-if="album?.access?.share" variant="subtle" :aria-label="__('Share')" @click="sharing = true">
        <template #[iconSlot]><LucideShare2 class="size-4" /></template>
        <template v-if="!phone">{{ __('Share') }}</template>
      </Button>
      <Button
        v-if="album"
        class="max-sm:hidden"
        variant="ghost"
        :aria-label="__('Activity')"
        :class="{ 'bg-surface-gray-3': showActivity }"
        @click="showActivity = !showActivity"
      >
        <template #icon><LucideMessageCircle class="size-4" /></template>
      </Button>
      <Button
        v-if="handle.feed.rows.length"
        class="max-sm:hidden"
        variant="ghost"
        :aria-label="__('Slideshow')"
        @click="slideshow"
      >
        <template #icon><LucidePlay class="size-4" /></template>
      </Button>
      <Dropdown v-if="menu.length" :options="menu">
        <Button variant="ghost" :aria-label="__('Album options')">
          <template #icon><LucideEllipsis class="size-4" /></template>
        </Button>
      </Dropdown>
    </template>
  </PhotosHeader>

  <form
    v-if="gate === 'locked'"
    class="mx-auto flex max-w-xs flex-col items-center gap-3 px-6 py-24 text-center"
    @submit.prevent="unlock"
  >
    <LucideLock class="size-6 text-ink-gray-6" />
    <div class="text-lg font-medium text-ink-gray-8">{{ __('This album is protected') }}</div>
    <div class="text-base text-ink-gray-5">{{ __('Enter the password you were given.') }}</div>
    <Password v-model="password" class="w-full" autofocus />
    <ErrorMessage :message="passwordError" />
    <Button variant="solid" class="w-full" type="submit" :loading="unlocking">{{ __('Open album') }}</Button>
  </form>
  <div v-else-if="gate === 'expired'" class="flex flex-col items-center gap-2 px-6 py-24 text-center">
    <div class="text-lg font-medium text-ink-gray-8">{{ __('This link has expired') }}</div>
    <div class="text-base text-ink-gray-5">{{ __('Ask the person who shared it for a new one.') }}</div>
  </div>
  <div v-else-if="error" class="flex flex-col items-center justify-center gap-3 px-6 py-24 text-center">
    <div class="flex size-14 items-center justify-center rounded-full bg-surface-gray-2">
      <LucideLock class="size-6 text-ink-gray-6" />
    </div>
    <div class="text-lg font-medium text-ink-gray-8">{{ __("You can't open this album") }}</div>
    <div class="max-w-sm text-base text-ink-gray-5">{{ error }}</div>
    <Button v-if="loggedIn" variant="subtle" size="md" class="mt-2" :route="{ name: 'photos-albums' }">
      {{ __('Go to albums') }}
    </Button>
  </div>
  <div v-else class="flex min-h-full">
    <div class="min-w-0 flex-1">
      <div v-if="found" class="flex items-center gap-2 px-4 py-3 sm:px-5">
        <span class="flex-1 text-base font-medium text-ink-gray-8">
          {{ foundLabel }}
        </span>
        <Button v-if="album?.access?.download" variant="solid" @click="downloadFound">
          {{ __('Download these') }}
        </Button>
        <Button variant="subtle" @click="showAll">{{ __('Show all') }}</Button>
      </div>
      <PhotoGrid
        :handle="handle"
        :empty-icon="LucideImagePlus"
        :empty-title="__('This album is empty')"
        :empty-text="album?.access?.write ? __('Use Add photos to pick from your library.') : ''"
      />
    </div>
    <ActivityPanel
      v-if="showActivity && album"
      class="sticky top-0 h-[calc(100vh-3rem)]"
      :album="album.name"
      :can-moderate="Boolean(album.access?.owner)"
      @close="showActivity = false"
      @open-photo="openPhoto"
      @changed="handle.reload()"
    />
  </div>

  <ShareAlbumDialog v-if="album" v-model="sharing" :album="album" @changed="refresh" />
  <AutoPeopleDialog
    v-if="album?.access?.owner"
    v-model="autoPeople"
    :album="album"
    @saved="(handle.reload(), refresh())"
  />
  <AlbumLinkDialog
    v-if="album?.access?.owner"
    v-model="linkSettings"
    :album="props.album"
    @share="((linkSettings = false), (sharing = true))"
  />
  <Dialog
    v-model:open="askingName"
    :title="__('Add your photos')"
    size="sm"
    :actions="[{ label: __('Continue'), variant: 'solid', onClick: pickContributions }]"
  >
    <div class="flex flex-col gap-2">
      <div class="text-base text-ink-gray-6">{{ __('Your name is shown next to the photos you add.') }}</div>
      <TextInput v-model="guestName" :placeholder="__('Your name')" @keydown.enter="pickContributions" />
    </div>
  </Dialog>
  <AddPhotosDialog v-if="album" v-model="adding" :album="album" @added="handle.reload()" />
  <Dialog
    v-model:open="renaming"
    :title="__('Rename album')"
    size="sm"
    :actions="[{ label: __('Save'), variant: 'solid', onClick: saveTitle }]"
  >
    <TextInput v-model="title" autofocus @keydown.enter="saveTitle" />
  </Dialog>
  <Dialog
    v-model:open="deleting"
    :title="__('Delete album?')"
    :message="__('People you shared it with lose access. The photos stay in your library and in Drive.')"
    icon="lucide-trash-2"
    theme="red"
    size="sm"
    :actions="[{ label: __('Delete'), variant: 'solid', theme: 'red', onClick: remove }]"
  />
</template>

<script setup lang="ts">
import { errorText } from '../resources/drive'
import { computed, onBeforeUnmount, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useMediaQuery } from '@vueuse/core'
import { Button, Dialog, Dropdown, ErrorMessage, Password, TextInput, toast, usePageMeta } from 'frappe-ui'
import LucideLock from '~icons/lucide/lock'
import LucideChevronRight from '~icons/lucide/chevron-right'
import LucideEllipsis from '~icons/lucide/ellipsis'
import LucideImagePlus from '~icons/lucide/image-plus'
import LucideMessageCircle from '~icons/lucide/message-circle'
import LucidePlay from '~icons/lucide/play'
import LucideShare2 from '~icons/lucide/share-2'
import LucideScanFace from '~icons/lucide/scan-face'

import { useSessionStore } from '@/boot/session'
import { appPageMeta } from '@/utils/documentTitle'
import { readString, writeString } from '@/utils/localStorage'
import {
  ALBUM_PHOTOS,
  type Album,
  albumGate,
  collectUpload,
  deleteAlbum,
  findMe,
  getAlbum,
  getAlbumFiles,
  leaveAlbum,
  removeFromAlbum,
  renameAlbum,
  setCover,
  unlockAlbum,
} from '../resources/albums'
import { type Photo } from '../resources/photos'
import { exportAlbum } from '../resources/export'
import ActivityPanel from '../components/ActivityPanel.vue'
import SelfieCamera from '../components/SelfieCamera.vue'
import AddPhotosDialog from '../components/AddPhotosDialog.vue'
import AlbumLinkDialog from '../components/AlbumLinkDialog.vue'
import AutoPeopleDialog from '../components/AutoPeopleDialog.vue'
import PhotoGrid from '../components/PhotoGrid.vue'
import PhotosHeader from '../components/PhotosHeader.vue'
import ShareAlbumDialog from '../components/ShareAlbumDialog.vue'
import { clearSelection } from '../data/selection'
import { createFeed } from '../data/feed'
import { download } from '../data/actions'
import { loadAlbums } from '../data/albums'
import { onUploaded } from '../data/uploads'
import { openLightbox } from '../data/viewer'
import { startExport } from '../data/imports'

const props = defineProps<{ album: string }>()
const router = useRouter()
const loggedIn = computed(() => useSessionStore().isLoggedIn)

const handle = createFeed(ALBUM_PHOTOS, { album: props.album })
const album = ref<Album | null>(null)
const error = ref('')
const sharing = ref(false)
const adding = ref(false)
const renaming = ref(false)
const deleting = ref(false)
const title = ref('')
const showActivity = ref(false)
const selfieInput = ref<HTMLInputElement>()
const finding = ref(false)
const found = ref<string[] | null>(null)
const foundLabel = computed(() => {
  if (handle.feed.hasNext) return __("You're in {0} photos and videos", [found.value?.length ?? 0])
  const videos = handle.feed.rows.filter((row) => row.mime_type?.startsWith('video/')).length
  const photos = handle.feed.rows.length - videos
  const parts = [
    photos && (photos === 1 ? __('1 photo') : __('{0} photos', [photos])),
    videos && (videos === 1 ? __('1 video') : __('{0} videos', [videos])),
  ].filter(Boolean)
  return __("You're in {0}", [parts.join(__(' and '))])
})

const camera = ref(false)
const touchScreen = useMediaQuery('(pointer: coarse)')

function startFindMe() {
  if (import.meta.env.VITE_NATIVE || touchScreen.value || !navigator.mediaDevices?.getUserMedia)
    return selfieInput.value?.click()
  camera.value = true
}

function onSelfie(event: Event) {
  const input = event.target as HTMLInputElement
  const selfie = input.files?.[0]
  input.value = ''
  if (selfie) search(selfie)
}

async function search(selfie: File) {
  finding.value = true
  try {
    const files = await findMe(props.album, selfie)
    if (!files.length) return toast.info(__("We couldn't find you in this album"))
    found.value = files
    handle.feed.params = { album: props.album, only: JSON.stringify(files) }
    await handle.reload()
  } catch (error) {
    toast.warning(errorText(error) || __('Could not look for you. Try again.'))
  } finally {
    finding.value = false
  }
}

function showAll() {
  found.value = null
  handle.feed.params = { album: props.album }
  handle.reload()
}

function downloadFound() {
  if (found.value) download(found.value.map((name) => ({ name, album: props.album }) as Photo))
}

function openPhoto(file: string) {
  if (handle.feed.rows.some((row) => row.name === file)) openLightbox(handle, file)
}

async function refresh() {
  try {
    album.value = await getAlbum(props.album)
    gate.value = null
  } catch {
    const state = await albumGate(props.album).catch(() => null)
    if (state?.locked || state?.expired) {
      gate.value = state.locked ? 'locked' : 'expired'
      return
    }
    error.value = loggedIn.value
      ? __('It was deleted, or the owner has not shared it with you. Ask them to share it again.')
      : __('Sign in to see this album.')
  }
}
refresh()
onBeforeUnmount(
  onUploaded(() => {
    handle.reload()
    refresh()
  }),
)

const phone = useMediaQuery('(max-width: 639px)')
const iconSlot = computed(() => (phone.value ? 'icon' : 'prefix'))

const menu = computed(() => {
  const access = album.value?.access
  if (!access) return []
  const items = []
  if (phone.value) {
    items.push({
      label: __('Activity'),
      icon: 'lucide-message-circle',
      onClick: () => (showActivity.value = true),
    })
    if (handle.feed.rows.length)
      items.push({ label: __('Slideshow'), icon: 'lucide-play', onClick: slideshow })
  }
  if (album.value?.count && access.download)
    items.push({ label: __('Download album'), icon: 'lucide-download', onClick: downloadAll })
  if (access.write)
    items.push({
      label: __('Rename'),
      icon: 'lucide-pencil',
      onClick: () => {
        title.value = album.value?.title ?? ''
        renaming.value = true
      },
    })
  if (access.owner)
    items.push({
      label: __('Auto-add people'),
      icon: 'lucide-users-round',
      onClick: () => (autoPeople.value = true),
    })
  if (access.owner)
    items.push({
      label: __('Link settings'),
      icon: 'lucide-link',
      onClick: () => (linkSettings.value = true),
    })
  if (access.owner)
    items.push({ label: __('Delete album'), icon: 'lucide-trash-2', onClick: () => (deleting.value = true) })
  else if (loggedIn.value) items.push({ label: __('Leave album'), icon: 'lucide-log-out', onClick: leave })
  return items
})

async function downloadAll() {
  if (!import.meta.env.VITE_NATIVE) return startExport(() => exportAlbum(props.album))
  const files = await getAlbumFiles(props.album)
  download(files.map((name) => ({ name, album: props.album }) as Photo))
}

const gate = ref<'locked' | 'expired' | null>(null)
const password = ref('')
const passwordError = ref('')
const unlocking = ref(false)
const linkSettings = ref(false)
const autoPeople = ref(false)
const askingName = ref(false)
const guestName = ref(readString('photos-guest-name'))
const contributing = ref(false)

async function unlock() {
  unlocking.value = true
  passwordError.value = ''
  try {
    await unlockAlbum(props.album, password.value)
    await refresh()
    handle.reload()
  } catch (error) {
    passwordError.value = errorText(error) || __('That password is not right.')
  } finally {
    unlocking.value = false
  }
}

function contribute() {
  if (!loggedIn.value && !guestName.value.trim()) askingName.value = true
  else pickContributions()
}

function pickContributions() {
  if (!loggedIn.value && !guestName.value.trim()) return
  askingName.value = false
  writeString('photos-guest-name', guestName.value.trim())
  const input = document.createElement('input')
  input.type = 'file'
  input.multiple = true
  input.accept = 'image/*,video/*'
  input.onchange = () => input.files && uploadContributions([...input.files])
  input.click()
}

async function uploadContributions(files: File[]) {
  contributing.value = true
  let added = 0
  for (const file of files) {
    try {
      await collectUpload(props.album, file, loggedIn.value ? undefined : guestName.value.trim())
      added++
    } catch (error) {
      toast.error(`${file.name}: ${(error as Error).message}`)
    }
  }
  contributing.value = false
  if (added) {
    toast.success(added === 1 ? __('1 item added') : __('{0} items added', [added]))
    handle.reload()
    refresh()
  }
}

function slideshow() {
  openLightbox(handle, handle.feed.rows[0].name, true)
}

async function saveTitle() {
  if (!title.value.trim()) return
  await renameAlbum(props.album, title.value)
  renaming.value = false
  await refresh()
  loadAlbums()
}

async function remove() {
  await deleteAlbum(props.album)
  await loadAlbums()
  router.push({ name: 'photos-albums' })
}

async function leave() {
  await leaveAlbum(props.album)
  await loadAlbums()
  toast.success(__('You left {0}', [album.value?.title ?? '']))
  router.push({ name: 'photos-sharing' })
}

async function removeItems(files: string[]) {
  await removeFromAlbum(props.album, files)
  handle.remove(files)
  clearSelection()
  toast.success(__('Removed from album'))
  refresh()
}

async function useAsCover(file: string) {
  await setCover(props.album, file)
  toast.success(__('Album cover updated'))
  loadAlbums()
}

usePageMeta(() => appPageMeta(album.value?.title, 'Photos'))
</script>
