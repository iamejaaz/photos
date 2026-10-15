<template>
  <Teleport to="body">
    <div
      v-if="lightbox.open && photo"
      class="edge-to-edge fixed inset-0 z-50 flex text-white"
      :style="{ backgroundColor: `rgba(0, 0, 0, ${gestures.backdropOpacity.value})` }"
    >
      <div class="relative flex min-w-0 flex-1 flex-col">
        <div
          v-show="!lightbox.slideshow && chrome"
          class="absolute inset-x-0 top-0 z-10 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent p-3"
          :class="{ 'max-sm:hidden': lightbox.showInfo }"
        >
          <button class="flex lightbox-button" :aria-label="__('Close')" @click="close">
            <LucideArrowLeft class="size-5" />
          </button>
          <div class="flex items-center gap-1">
            <Tooltip :text="__('Slideshow')">
              <button class="flex lightbox-button max-sm:hidden" @click="lightbox.slideshow = true">
                <LucidePlay class="size-5" />
              </button>
            </Tooltip>
            <Tooltip v-if="albumName && loggedIn" :text="photo.liked ? __('Unlike') : __('Like')">
              <button class="flex lightbox-button w-auto gap-1.5 px-3" @click="like">
                <LucideHeart class="size-5" :class="{ 'fill-current text-ink-red-4': photo.liked }" />
                <span v-if="photo.likes" class="text-sm">{{ photo.likes }}</span>
              </button>
            </Tooltip>
            <Tooltip :text="__('Info')">
              <button
                class="flex lightbox-button max-sm:hidden"
                :class="{ 'bg-white/15': lightbox.showInfo }"
                @click="lightbox.showInfo = !lightbox.showInfo"
              >
                <LucideInfo class="size-5" />
              </button>
            </Tooltip>
            <template v-if="inDrive">
              <Tooltip :text="photo.is_favourite ? __('Remove from favourites') : __('Favourite')">
                <button class="flex lightbox-button" @click="toggleFavourite([photo])">
                  <LucideStar class="size-5" :class="{ 'fill-current': photo.is_favourite }" />
                </button>
              </Tooltip>
              <Tooltip :text="__('Add to album')">
                <button class="flex lightbox-button max-sm:hidden" @click="pickAlbumFor([photo.name])">
                  <LucideImagePlus class="size-5" />
                </button>
              </Tooltip>
            </template>
            <Tooltip v-if="inDrive" :text="isVideo(photo) ? __('Trim') : __('Edit')">
              <button class="flex lightbox-button max-sm:hidden" @click="editing = true">
                <LucideSlidersHorizontal class="size-5" />
              </button>
            </Tooltip>
            <Tooltip v-if="inDrive" :text="__('Share')">
              <button class="flex lightbox-button max-sm:hidden" @click="openShare([photo.name])">
                <LucideShare2 class="size-5" />
              </button>
            </Tooltip>
            <Tooltip v-if="photo.download !== 0" :text="__('Download')">
              <a
                class="flex lightbox-button max-sm:hidden"
                :href="downloadUrl(photo.name, photo.album)"
                @click="nativeDownload($event, photo)"
              >
                <LucideDownload class="size-5" />
              </a>
            </Tooltip>
            <template v-if="inDrive">
              <Tooltip :text="details.archived ? __('Unarchive') : __('Archive')">
                <button class="flex lightbox-button max-sm:hidden" @click="toggleArchive">
                  <component :is="details.archived ? LucideArchiveRestore : LucideArchive" class="size-5" />
                </button>
              </Tooltip>
              <Tooltip :text="__('Open in Drive')">
                <button class="flex lightbox-button max-sm:hidden" @click="openInDrive">
                  <LucideFolderOpen class="size-5" />
                </button>
              </Tooltip>
            </template>
            <Dropdown :options="moreActions" placement="right">
              <button class="flex lightbox-button sm:hidden" :aria-label="__('More')">
                <LucideEllipsisVertical class="size-5" />
              </button>
            </Dropdown>
            <Tooltip v-if="photo.write" :text="__('Move to trash')">
              <button class="flex lightbox-button max-sm:hidden" @click="removeCurrent">
                <LucideTrash2 class="size-5" />
              </button>
            </Tooltip>
          </div>
        </div>

        <div
          class="relative flex min-h-0 flex-1 touch-none select-none items-center justify-center overflow-hidden"
          v-on="gestures.handlers"
          @dragstart.prevent
        >
          <div class="absolute inset-0 flex items-center justify-center" :style="gestures.trackStyle.value">
            <template v-for="step in [-1, 1]" :key="step">
              <div
                v-if="neighbour(step)"
                class="pointer-events-none absolute inset-0 flex items-center justify-center"
                :style="{ transform: `translateX(calc(${step * 100}% + ${step * SWIPE_GAP}px))` }"
              >
                <img
                  :src="thumbnailUrl(neighbour(step)!.name, neighbour(step)!.album)"
                  class="size-full object-contain"
                  alt=""
                />
              </div>
            </template>
            <div class="flex size-full items-center justify-center" :style="gestures.contentStyle.value">
              <video
                v-if="isVideo(photo)"
                :key="photo.name"
                :src="streamUrl(photo.name, photo.album)"
                :poster="thumbnailUrl(photo.name, photo.album)"
                ref="videoEl"
                class="max-h-full max-w-full"
                controls
                autoplay
                @ended="lightbox.slideshow && go(1)"
              />
              <div v-else :key="photo.name" class="relative flex size-full items-center justify-center">
                <img
                  v-if="!loaded"
                  :src="thumbnailUrl(photo.name, photo.album)"
                  class="absolute size-full object-contain"
                  alt=""
                />
                <img
                  :src="contentUrl(photo.name, photo.album)"
                  :alt="photo.file_name"
                  class="relative size-full object-contain transition-opacity"
                  :class="loaded ? 'opacity-100' : 'opacity-0'"
                  @load="loaded = true"
                />
                <img
                  v-if="sharp"
                  :src="originalUrl(photo.name, photo.album)"
                  class="absolute size-full object-contain opacity-0"
                  alt=""
                  @load="($event.target as HTMLElement).classList.remove('opacity-0')"
                />
                <video
                  v-if="liveSource && livePlaying"
                  :key="liveSource"
                  :src="liveSource"
                  class="absolute max-h-full max-w-full object-contain"
                  :style="sizeStyle"
                  autoplay
                  muted
                  playsinline
                  @ended="livePlaying = false"
                  @error="livePlaying = false"
                />
                <button
                  v-if="liveSource"
                  class="absolute bottom-4 left-4 flex items-center gap-1.5 rounded-full bg-black/50 px-3 py-1 text-xs font-medium text-white"
                  :aria-pressed="livePlaying"
                  @click="livePlaying = !livePlaying"
                >
                  <LucideCirclePlay class="size-3.5" />
                  {{ __('Live') }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <button
          v-if="lightbox.index > 0 && !lightbox.slideshow && chrome"
          class="flex lightbox-button absolute left-3 top-1/2 -translate-y-1/2 bg-black/30 [@media(pointer:coarse)]:hidden"
          :aria-label="__('Previous')"
          @click="go(-1)"
        >
          <LucideChevronLeft class="size-6" />
        </button>
        <button
          v-if="(lightbox.index < rows.length - 1 || feed?.feed.hasNext) && !lightbox.slideshow && chrome"
          class="flex lightbox-button absolute right-3 top-1/2 -translate-y-1/2 bg-black/30 [@media(pointer:coarse)]:hidden"
          :aria-label="__('Next')"
          @click="go(1)"
        >
          <LucideChevronRight class="size-6" />
        </button>
        <div
          v-show="!lightbox.slideshow && chrome && !lightbox.showInfo"
          class="absolute inset-x-0 bottom-0 z-10 flex justify-around bg-gradient-to-t from-black/60 to-transparent pb-3 pt-8 sm:hidden"
        >
          <button v-if="inDrive" class="viewer-action" @click="openShare([photo.name])">
            <LucideShare2 class="size-5" />
            {{ __('Share') }}
          </button>
          <button v-if="inDrive" class="viewer-action" @click="editing = true">
            <LucideSlidersHorizontal class="size-5" />
            {{ isVideo(photo) ? __('Trim') : __('Edit') }}
          </button>
          <button class="viewer-action" @click="lightbox.showInfo = true">
            <LucideInfo class="size-5" />
            {{ __('Info') }}
          </button>
          <button v-if="photo.write" class="viewer-action" @click="removeCurrent">
            <LucideTrash2 class="size-5" />
            {{ __('Delete') }}
          </button>
        </div>
        <div v-if="lightbox.slideshow" class="absolute inset-x-0 bottom-6 flex justify-center">
          <button
            class="rounded-full bg-black/50 px-4 py-2 text-sm text-white"
            @click="lightbox.slideshow = false"
          >
            {{ __('Stop slideshow') }}
          </button>
        </div>
      </div>

      <aside
        v-if="lightbox.showInfo"
        class="flex w-full max-w-sm shrink-0 flex-col overflow-y-auto bg-surface-base text-ink-gray-8 max-sm:absolute max-sm:inset-0 max-sm:max-w-none"
      >
        <div class="flex items-center gap-2 px-5 py-4">
          <button
            class="rounded p-1 hover:bg-surface-gray-2"
            :aria-label="__('Close')"
            @click="lightbox.showInfo = false"
          >
            <LucideX class="size-5" />
          </button>
          <span class="text-lg font-medium">{{ __('Info') }}</span>
        </div>
        <div v-if="details" class="flex flex-col gap-5 px-5 pb-8 text-base">
          <Textarea
            v-if="photo.write"
            v-model="caption"
            :placeholder="__('Add a caption')"
            :rows="2"
            variant="ghost"
            class="-mx-2"
            @blur="saveCaption"
          />
          <p v-else-if="meta?.description" class="whitespace-pre-line text-ink-gray-8">
            {{ meta.description }}
          </p>
          <section>
            <div class="mb-2 text-sm font-medium text-ink-gray-5">
              {{ __('Details') }}
            </div>
            <dl class="flex flex-col gap-3">
              <InfoRow :icon="LucideCalendar" :title="takenTitle" :subtitle="takenSubtitle">
                <template v-if="photo.write" #action>
                  <Button
                    variant="ghost"
                    :aria-label="__('Edit date')"
                    @click="editMetadata('date', [photo.name])"
                  >
                    <template #icon><LucidePencil class="size-4" /></template>
                  </Button>
                </template>
              </InfoRow>
              <InfoRow :icon="LucideImage" :title="details.file_name" :subtitle="sizeLine" />
              <InfoRow v-if="meta?.camera" :icon="LucideAperture" :title="meta.camera" />
              <InfoRow
                v-if="photo.added_by_name"
                :icon="LucideUserRound"
                :title="__('Added by {0}', [photo.added_by_name])"
                :subtitle="__('Through the album link')"
              />
              <InfoRow
                v-if="meta?.latitude"
                :icon="LucideMapPin"
                :title="meta.place || `${meta.latitude.toFixed(4)}, ${meta.longitude.toFixed(4)}`"
                :subtitle="
                  meta.place ? `${meta.latitude.toFixed(4)}, ${meta.longitude.toFixed(4)}` : undefined
                "
                :href="`https://www.openstreetmap.org/?mlat=${meta.latitude}&mlon=${meta.longitude}#map=14/${meta.latitude}/${meta.longitude}`"
              >
                <template v-if="photo.write" #action>
                  <Button
                    variant="ghost"
                    :aria-label="__('Edit location')"
                    @click="editMetadata('location', [photo.name])"
                  >
                    <template #icon><LucidePencil class="size-4" /></template>
                  </Button>
                </template>
              </InfoRow>
              <button
                v-else-if="photo.write"
                class="flex items-center gap-3 text-left text-ink-gray-5 hover:text-ink-gray-8"
                @click="editMetadata('location', [photo.name])"
              >
                <LucideMapPin class="size-5 shrink-0" />
                {{ __('Add a location') }}
              </button>
            </dl>
          </section>
          <section v-if="photoPeople.length">
            <div class="mb-2 text-sm font-medium text-ink-gray-5">{{ __('People') }}</div>
            <div class="flex flex-wrap gap-3">
              <div
                v-for="entry in photoPeople"
                :key="entry.face"
                class="flex w-16 flex-col items-center gap-1 text-center"
              >
                <button
                  v-if="isVideo(photo)"
                  class="relative"
                  :aria-label="__('Jump to {0}', [entry.person_name || __('this person')])"
                  @click="seek(entry.timestamp)"
                >
                  <FaceAvatar :face="entry.face" class="size-12" />
                  <span
                    class="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded bg-surface-gray-10 px-1 text-xs text-ink-base"
                  >
                    {{ formatTime(entry.timestamp) }}
                  </span>
                </button>
                <router-link v-else :to="{ name: 'photos-person', params: { person: entry.person } }">
                  <FaceAvatar :face="entry.face" class="size-12" />
                </router-link>
                <Dropdown v-if="photo.write" :options="faceMenu(entry)" class="w-full">
                  <button class="w-full truncate text-xs text-ink-gray-7 hover:underline">
                    {{ entry.person_name || __('Add a name') }}
                  </button>
                </Dropdown>
                <router-link
                  v-else
                  :to="{ name: 'photos-person', params: { person: entry.person } }"
                  class="w-full truncate text-xs text-ink-gray-7 hover:underline"
                >
                  {{ entry.person_name || __('Add a name') }}
                </router-link>
              </div>
            </div>
          </section>
          <section v-if="details.original">
            <div class="mb-2 text-sm font-medium text-ink-gray-5">
              {{ __('Edited copy') }}
            </div>
            <dl class="flex flex-col gap-3">
              <InfoRow
                :icon="LucideImage"
                :title="details.original.file_name"
                :subtitle="__('The original is kept unchanged')"
              >
                <template #action>
                  <Button size="sm" @click="openOriginal">{{ __('Open original') }}</Button>
                </template>
              </InfoRow>
            </dl>
          </section>
          <section v-if="details.folder">
            <div class="mb-2 text-sm font-medium text-ink-gray-5">
              {{ __('In Drive') }}
            </div>
            <dl class="flex flex-col gap-3">
              <InfoRow
                :icon="LucideFolder"
                :title="details.folder_title"
                :subtitle="__('Uploaded by {0}', [details.owner_name || details.owner])"
                :href="`/drive/d/${details.folder}`"
              />
            </dl>
          </section>
          <section v-if="photoAlbums.length">
            <div class="mb-2 text-sm font-medium text-ink-gray-5">
              {{ __('Albums') }}
            </div>
            <div class="flex flex-col gap-1">
              <router-link
                v-for="album in photoAlbums"
                :key="album.name"
                :to="{ name: 'photos-album', params: { album: album.name } }"
                class="rounded px-2 py-1.5 hover:bg-surface-gray-2"
              >
                {{ album.title }}
              </router-link>
            </div>
          </section>
        </div>
        <div v-else class="flex justify-center py-10">
          <LoadingIndicator class="size-5" />
        </div>
      </aside>
    </div>
    <VideoTrimmer :photo="editing && photo && isVideo(photo) ? photo : null" @close="editing = false" />
    <PhotoEditor
      :photo="editing && photo && !isVideo(photo) ? photo : null"
      :folder="details?.folder"
      @close="editing = false"
      @saved="notifyUploaded"
    />
  </Teleport>
  <MoveFaceDialog
    v-model="moveOpen"
    :face="movingFace?.face ?? null"
    :current="movingFace?.person"
    @moved="metadataEdits.version++"
  />
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Button, Dropdown, LoadingIndicator, Textarea, Tooltip, toast, useKeyboardShortcut } from 'frappe-ui'
import dayjs from 'dayjs'
import LucideAperture from '~icons/lucide/aperture'
import LucideArchive from '~icons/lucide/archive'
import LucideArchiveRestore from '~icons/lucide/archive-restore'
import LucideArrowLeft from '~icons/lucide/arrow-left'
import LucideCalendar from '~icons/lucide/calendar'
import LucideChevronLeft from '~icons/lucide/chevron-left'
import LucideCirclePlay from '~icons/lucide/circle-play'
import LucideChevronRight from '~icons/lucide/chevron-right'
import LucideDownload from '~icons/lucide/download'
import LucideShare2 from '~icons/lucide/share-2'
import LucideEllipsisVertical from '~icons/lucide/ellipsis-vertical'
import LucideFolder from '~icons/lucide/folder'
import LucideFolderOpen from '~icons/lucide/folder-open'
import LucideImage from '~icons/lucide/image'
import LucideImagePlus from '~icons/lucide/image-plus'
import LucideHeart from '~icons/lucide/heart'
import LucideInfo from '~icons/lucide/info'
import LucideMapPin from '~icons/lucide/map-pin'
import LucidePencil from '~icons/lucide/pencil'
import LucideUserRound from '~icons/lucide/user-round'
import LucidePlay from '~icons/lucide/play'
import LucideSlidersHorizontal from '~icons/lucide/sliders-horizontal'
import LucideStar from '~icons/lucide/star'
import LucideTrash2 from '~icons/lucide/trash-2'
import LucideX from '~icons/lucide/x'

import { useSessionStore } from '@/boot/session'
import { ALBUM_PHOTOS, toggleLike } from '../resources/albums'
import { type Photo, getDetails, isVideo } from '../resources/photos'
import { type PhotoPerson, getPhotoPeople, markNotAFace, unassignFace } from '../resources/people'
import { contentUrl, downloadUrl, liveUrl, originalUrl, streamUrl, thumbnailUrl } from '../resources/media'
import { editCaption } from '../resources/edit'
import { activeFeed, createStaticFeed } from '../data/feed'
import { albums, pickAlbumFor, sharedAlbums } from '../data/albums'
import { archive, download, toggleFavourite, trash } from '../data/actions'
import { editMetadata, openShare, editing as metadataEdits } from '../data/dialogs'
import { openLightbox, lightbox } from '../data/viewer'
import { notifyUploaded } from '../data/uploads'
import InfoRow from './InfoRow.vue'
import MoveFaceDialog from './MoveFaceDialog.vue'
import FaceAvatar from './FaceAvatar.vue'
import { formatBytes } from '../format'
import { useBackClose } from '../composables/useBackClose'
import { SWIPE_GAP, useViewerGestures } from '../composables/useViewerGestures'
import PhotoEditor from './PhotoEditor.vue'
import VideoTrimmer from './VideoTrimmer.vue'

const router = useRouter()
const feed = computed(() => activeFeed.value)
const rows = computed(() => feed.value?.feed.rows ?? [])
const photo = computed(() => rows.value[lightbox.index])
const loaded = ref(false)
const sharp = ref(false)
const editing = ref(false)
const photoPeople = ref<PhotoPerson[]>([])

const moreActions = computed(() => {
  const items: { label: string; icon: string; onClick: () => unknown }[] = [
    { label: __('Slideshow'), icon: 'lucide-play', onClick: () => (lightbox.slideshow = true) },
  ]
  if (photo.value?.download !== 0)
    items.push({
      label: __('Download'),
      icon: 'lucide-download',
      onClick: () => photo.value && download([photo.value]),
    })
  if (inDrive.value) {
    items.push({
      label: __('Add to album'),
      icon: 'lucide-image-plus',
      onClick: () => pickAlbumFor([photo.value!.name]),
    })
    items.push({
      label: isVideo(photo.value!) ? __('Trim') : __('Edit'),
      icon: 'lucide-sliders-horizontal',
      onClick: () => (editing.value = true),
    })
    items.push({
      label: details.value?.archived ? __('Unarchive') : __('Archive'),
      icon: 'lucide-archive',
      onClick: toggleArchive,
    })
    items.push({ label: __('Open in Drive'), icon: 'lucide-folder-open', onClick: openInDrive })
  }
  return items
})
const livePlaying = ref(false)
const liveSource = computed(() => (photo.value ? liveUrl(photo.value) : null))
watch(
  () => photo.value?.name,
  () => (livePlaying.value = Boolean(liveSource.value)),
  { immediate: true },
)

function nativeDownload(event: MouseEvent, item: Photo) {
  if (!import.meta.env.VITE_NATIVE) return
  event.preventDefault()
  download([item])
}

const movingFace = ref<PhotoPerson | null>(null)
const moveOpen = ref(false)

function faceMenu(entry: PhotoPerson) {
  const name = entry.person_name || __('this person')
  return [
    {
      label: __('Open {0}', [name]),
      icon: 'lucide-user-round',
      onClick: () => router.push({ name: 'photos-person', params: { person: entry.person } }),
    },
    {
      label: __('Move to another person'),
      icon: 'lucide-arrow-right-left',
      onClick: () => ((movingFace.value = entry), (moveOpen.value = true)),
    },
    { label: __('Not {0}', [name]), icon: 'lucide-user-x', onClick: () => fixFace(unassignFace(entry.face)) },
    { label: __('Not a face'), icon: 'lucide-scan-face', onClick: () => fixFace(markNotAFace(entry.face)) },
  ]
}

async function fixFace(request: Promise<unknown>) {
  await request
  metadataEdits.version++
  toast.success(__('Thanks, People is updated'))
}

const videoEl = ref<HTMLVideoElement>()

function seek(timestamp: number | null) {
  if (!videoEl.value) return
  videoEl.value.currentTime = timestamp ?? 0
  videoEl.value.play()
}

function formatTime(seconds: number | null) {
  const total = Math.round(seconds ?? 0)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}
const loggedIn = computed(() => useSessionStore().isLoggedIn)
const albumName = computed(() =>
  feed.value?.feed.method === ALBUM_PHOTOS ? String(feed.value.feed.params.album) : null,
)

async function like() {
  if (!photo.value || !albumName.value) return
  const target = photo.value
  const liked = await toggleLike(albumName.value, target.name)
  target.liked = liked
  target.likes = (target.likes ?? 0) + (liked ? 1 : -1)
}
const details = ref<any>(null)

const meta = computed(() => details.value?.metadata)
const caption = ref('')
watch(meta, (value) => (caption.value = value?.description ?? ''), { immediate: true })

async function saveCaption() {
  if (!photo.value || !meta.value || caption.value.trim() === (meta.value.description ?? '')) return
  meta.value.description = (await editCaption(photo.value.name, caption.value)) ?? ''
}
const inDrive = computed(() => Boolean(details.value?.folder))
const photoAlbums = computed(() =>
  [...albums.value, ...sharedAlbums.value].filter((album) => details.value?.albums?.includes(album.name)),
)
const SLIDE_MS = 4000
let slideTimer: ReturnType<typeof setTimeout> | undefined
const sizeStyle = computed(() =>
  photo.value?.width
    ? {
        aspectRatio: `${photo.value.width} / ${photo.value.height}`,
        height: '100%',
      }
    : {},
)

const takenTitle = computed(() => dayjs(photo.value?.taken).format('ddd, D MMM YYYY'))
const takenSubtitle = computed(() => {
  const time = dayjs(photo.value?.taken).format('h:mm A')
  return meta.value?.date_from_file ? `${time} · ${__('from file date')}` : time
})
const sizeLine = computed(() => {
  const parts = []
  if (meta.value?.width) {
    const megapixels = (meta.value.width * meta.value.height) / 1e6
    if (!isVideo(photo.value)) parts.push(`${megapixels.toFixed(1)} MP`)
    parts.push(`${meta.value.width} × ${meta.value.height}`)
  }
  parts.push(formatBytes(details.value?.file_size || 0))
  return parts.join('  ·  ')
})

watch(
  [() => photo.value?.name, () => metadataEdits.version],
  async ([name], previous) => {
    if (name !== previous?.[0]) {
      loaded.value = false
      sharp.value = false
      details.value = null
    }
    if (!name) return
    if (lightbox.index >= rows.value.length - 3) feed.value?.loadMore()
    photoPeople.value = []
    const result = await getDetails(name, photo.value?.album)
    if (photo.value?.name !== name) return
    details.value = result
    if (result.folder && loggedIn.value) {
      const found = await getPhotoPeople(name, photo.value?.album).catch(() => [])
      if (photo.value?.name === name) photoPeople.value = found
    }
  },
  { immediate: true },
)

watch([() => lightbox.slideshow, () => photo.value?.name, loaded], ([playing]) => {
  clearTimeout(slideTimer)
  if (!playing || !photo.value || isVideo(photo.value) || !loaded.value) return
  slideTimer = setTimeout(async () => {
    if (lightbox.index >= rows.value.length - 1 && !feed.value?.feed.hasNext) lightbox.index = 0
    else await go(1)
  }, SLIDE_MS)
})

watch(
  () => rows.value.length,
  (length) => {
    if (lightbox.open && !length) close()
    else if (lightbox.index >= length) lightbox.index = length - 1
  },
)

function close() {
  lightbox.open = false
  lightbox.slideshow = false
}

const chrome = ref(true)
useBackClose(
  () => lightbox.open && lightbox.showInfo,
  () => (lightbox.showInfo = false),
)
const neighbour = (step: number) => rows.value[lightbox.index + step]
watch(
  () => lightbox.open && lightbox.index,
  () => {
    if (!lightbox.open) return
    for (const step of [1, -1]) {
      const next = neighbour(step)
      if (next && !isVideo(next)) new Image().src = contentUrl(next.name, next.album)
    }
  },
)
const gestures = useViewerGestures({
  canPrevious: () => lightbox.index > 0,
  canNext: () => lightbox.index < rows.value.length - 1 || Boolean(feed.value?.feed.hasNext),
  onPrevious: () => go(-1),
  onNext: () => go(1),
  onClose: close,
  onInfo: () => (lightbox.showInfo = true),
  onTap: () => (chrome.value = !chrome.value),
  zoomable: () => Boolean(photo.value && !isVideo(photo.value)),
})
watch(
  () => photo.value?.name,
  () => gestures.reset(),
)
watch(
  () => gestures.state.scale > 1.2,
  (zoomed) => zoomed && (sharp.value = true),
)

if (import.meta.env.VITE_NATIVE)
  watch([() => lightbox.open && !lightbox.showInfo, chrome], ([open, visible]) =>
    import('../native/bars').then(({ viewerBars }) => viewerBars(open, visible)),
  )

const onPopState = () => lightbox.open && close()
watch(
  () => lightbox.open,
  (open) => {
    if (open && !history.state?.photosViewer) {
      chrome.value = true
      history.pushState({ ...history.state, photosViewer: true }, '')
    } else if (!open && history.state?.photosViewer) history.back()
  },
  { immediate: true },
)

async function toggleArchive() {
  if (!photo.value || !details.value) return
  await archive([photo.value.name], !details.value.archived)
}

async function go(step: number) {
  const next = lightbox.index + step
  if (next < 0) return
  if (next >= rows.value.length) {
    await feed.value?.loadMore()
    if (next >= rows.value.length) return
  }
  lightbox.index = next
}

function openOriginal() {
  if (!details.value?.original) return
  lightbox.showInfo = false
  openLightbox(createStaticFeed([details.value.original]), details.value.original.name)
}

function openInDrive() {
  if (!photo.value) return
  close()
  window.location.assign(`/drive/f/${photo.value.name}`)
}

async function removeCurrent() {
  if (photo.value) await trash([photo.value.name])
}

function stopSlideshow(event: KeyboardEvent) {
  if (!lightbox.open || !lightbox.slideshow) return
  lightbox.slideshow = false
  event.preventDefault()
  event.stopImmediatePropagation()
}

const viewing = () => lightbox.open && !lightbox.slideshow && !editing.value
useKeyboardShortcut([
  {
    combo: 'ArrowLeft',
    description: __('Previous photo'),
    group: __('Viewer'),
    enabled: viewing,
    handler: () => go(-1),
  },
  {
    combo: 'ArrowRight',
    description: __('Next photo'),
    group: __('Viewer'),
    enabled: viewing,
    handler: () => go(1),
  },
  {
    combo: 'I',
    description: __('Show or hide info'),
    group: __('Viewer'),
    enabled: viewing,
    handler: () => (lightbox.showInfo = !lightbox.showInfo),
  },
  {
    combo: 'F',
    description: __('Favourite'),
    group: __('Viewer'),
    enabled: () => viewing() && inDrive.value,
    handler: () => photo.value && toggleFavourite([photo.value]),
  },
  {
    combo: 'S',
    description: __('Start slideshow'),
    group: __('Viewer'),
    enabled: viewing,
    handler: () => (lightbox.slideshow = true),
  },
  { combo: 'Escape', description: __('Close'), group: __('Viewer'), enabled: viewing, handler: close },
])

onMounted(() => {
  window.addEventListener('keydown', stopSlideshow, { capture: true })
  window.addEventListener('popstate', onPopState)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', stopSlideshow, { capture: true })
  window.removeEventListener('popstate', onPopState)
  clearTimeout(slideTimer)
})
</script>

<style scoped>
.viewer-action {
  display: flex;
  min-width: 4rem;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  border-radius: 0.5rem;
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
  color: rgb(255 255 255 / 0.9);
}
.viewer-action:active {
  background-color: rgb(255 255 255 / 0.15);
}
.lightbox-button {
  @apply size-10 items-center justify-center rounded-full text-white/90 transition-colors hover:bg-white/15 hover:text-white;
}
</style>
