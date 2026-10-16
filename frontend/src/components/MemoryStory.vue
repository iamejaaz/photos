<template>
  <Teleport to="body">
    <div
      v-if="story.open && memory && photo"
      class="edge-to-edge fixed inset-0 z-50 select-none bg-black text-white"
      @pointerdown="onDown"
      @pointerup="onUp"
      @pointercancel="onCancel"
      @contextmenu.prevent
    >
      <div class="absolute inset-0 overflow-hidden">
        <template v-if="isVideo(photo)">
          <video
            ref="videoEl"
            :key="photo.name"
            :src="streamUrl(photo.name)"
            :poster="thumbnailUrl(photo.name, undefined, true)"
            class="size-full object-contain"
            autoplay
            :muted="muted"
            playsinline
            @loadstart="buffering = true"
            @waiting="buffering = true"
            @playing="buffering = false"
            @ended="next"
          />
          <LoadingIndicator
            v-if="buffering"
            class="pointer-events-none absolute left-1/2 top-1/2 size-8 -translate-x-1/2 -translate-y-1/2 text-white"
          />
        </template>
        <div v-else :key="photo.name" class="relative size-full">
          <img
            :src="thumbnailUrl(photo.name, undefined, true)"
            class="absolute inset-0 size-full object-contain"
            draggable="false"
            alt=""
          />
          <img
            :src="contentUrl(photo.name)"
            class="story-image relative size-full object-contain"
            :style="{ animationDuration: `${PHOTO_MS}ms`, animationPlayState: paused ? 'paused' : 'running' }"
            draggable="false"
            alt=""
          />
        </div>
      </div>

      <div class="absolute inset-x-0 top-0 bg-gradient-to-b from-black/60 to-transparent px-3 pb-10 pt-3">
        <div class="flex gap-1">
          <div
            v-for="(item, index) in memory.photos"
            :key="item.name"
            class="h-0.5 flex-1 overflow-hidden rounded bg-white/35"
          >
            <div
              class="h-full bg-white"
              :style="{ width: `${index < story.index ? 100 : index > story.index ? 0 : progress * 100}%` }"
            />
          </div>
        </div>
        <div class="mt-3 flex items-center justify-between">
          <div>
            <div class="text-base font-semibold">
              {{ memory.years_ago === 1 ? __('1 year ago') : __('{0} years ago', [memory.years_ago]) }}
            </div>
            <div class="text-xs text-white/80">{{ takenLabel }}</div>
          </div>
          <div class="flex items-center gap-1" @pointerdown.stop @pointerup.stop>
            <button
              v-if="isVideo(photo)"
              class="story-button"
              :aria-label="muted ? __('Unmute') : __('Mute')"
              @click="muted = !muted"
            >
              <component :is="muted ? LucideVolumeX : LucideVolume2" class="size-5" />
            </button>
            <button
              class="story-button"
              :aria-label="photo.is_favourite ? __('Remove from favourites') : __('Add to favourites')"
              @click="toggleFavourite([photo])"
            >
              <LucideStar class="size-5" :class="{ 'fill-current': photo.is_favourite }" />
            </button>
            <button class="story-button" :aria-label="__('Share')" @click="share">
              <LucideShare2 class="size-5" />
            </button>
            <Dropdown v-model:open="menuOpen" :options="menu" placement="right">
              <button class="story-button" :aria-label="__('More options')">
                <LucideEllipsisVertical class="size-5" />
              </button>
            </Dropdown>
            <button class="story-button" :aria-label="__('Close')" @click="close">
              <LucideX class="size-5" />
            </button>
          </div>
        </div>
      </div>
      <button
        class="absolute left-3 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/30 max-sm:hidden [@media(pointer:coarse)]:hidden"
        :aria-label="__('Previous')"
        @pointerdown.stop
        @pointerup.stop
        @click="previous"
      >
        <LucideChevronLeft class="size-6" />
      </button>
      <button
        class="absolute right-3 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/30 max-sm:hidden [@media(pointer:coarse)]:hidden"
        :aria-label="__('Next')"
        @pointerdown.stop
        @pointerup.stop
        @click="next"
      >
        <LucideChevronRight class="size-6" />
      </button>
      <HideFacesDialog
        v-model:open="hidingFaces"
        :people="uniquePeople"
        @changed="onFacesHidden"
        @pointerdown.stop
        @pointerup.stop
      />
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import dayjs from 'dayjs'
import { Dropdown, LoadingIndicator, toast, useKeyboardShortcut } from 'frappe-ui'
import LucideChevronLeft from '~icons/lucide/chevron-left'
import LucideChevronRight from '~icons/lucide/chevron-right'
import LucideEllipsisVertical from '~icons/lucide/ellipsis-vertical'
import LucideShare2 from '~icons/lucide/share-2'
import LucideStar from '~icons/lucide/star'
import LucideVolume2 from '~icons/lucide/volume-2'
import LucideVolumeX from '~icons/lucide/volume-x'
import LucideX from '~icons/lucide/x'

import { contentUrl, streamUrl, thumbnailUrl } from '../resources/media'
import { isVideo } from '../resources/photos'
import { useBackClose } from '../composables/useBackClose'
import { memoriesVersion, memoryStory as story } from '../data/viewer'
import { type PhotoPerson, getPhotoPeople } from '../resources/people'
import { removeFromMemories } from '../resources/settings'
import HideFacesDialog from './HideFacesDialog.vue'
import { toggleFavourite } from '../data/actions'
import { openShare, sharePhotos } from '../data/dialogs'
import { errorText } from '../resources/drive'

const PHOTO_MS = 5000
const HOLD_MS = 220

const memory = computed(() => story.memories[story.memory])
const buffering = ref(false)
const photo = computed(() => memory.value?.photos[story.index])
const progress = ref(0)
const paused = ref(false)
const muted = ref(true)
const menuOpen = ref(false)
const hidingFaces = ref(false)
const people = ref<PhotoPerson[]>([])
const uniquePeople = computed(() => {
  const seen = new Set<string>()
  return people.value
    .filter((entry) => !seen.has(entry.person) && seen.add(entry.person))
    .map((entry) => ({ name: entry.person, person_name: entry.person_name, face: entry.face }))
})
const takenLabel = computed(() => (photo.value ? dayjs(photo.value.taken).format('D MMM YYYY') : ''))

let frame = 0
let last = 0
let downAt = 0
let downX = 0
let downY = 0

function close() {
  story.open = false
}

watch(
  () => photo.value?.name,
  async (name) => {
    people.value = []
    if (!name) return
    const found = await getPhotoPeople(name).catch(() => [])
    if (photo.value?.name === name) people.value = found
  },
  { immediate: true },
)

const held = ref(false)
const videoEl = ref<HTMLVideoElement | null>(null)
watch(paused, (value) => {
  if (!videoEl.value) return
  if (value) videoEl.value.pause()
  else videoEl.value.play().catch(() => {})
})
watch(
  [menuOpen, hidingFaces, () => sharePhotos.open, held],
  ([menu, faces, sharing, hold]) => (paused.value = menu || faces || sharing || hold),
)
watch(
  () => [story.memory, story.index],
  () => (held.value = false),
)

const keys = () => story.open && !menuOpen.value && !hidingFaces.value && !sharePhotos.open
useKeyboardShortcut([
  {
    combo: 'ArrowLeft',
    description: __('Previous'),
    group: __('Memories'),
    enabled: keys,
    handler: () => previous(),
  },
  {
    combo: 'ArrowRight',
    description: __('Next'),
    group: __('Memories'),
    enabled: keys,
    handler: () => next(),
  },
  {
    combo: 'Space',
    description: __('Pause or play'),
    group: __('Memories'),
    enabled: keys,
    handler: () => (held.value = !held.value),
  },
  {
    combo: 'F',
    description: __('Favourite'),
    group: __('Memories'),
    enabled: keys,
    handler: () => photo.value && toggleFavourite([photo.value]),
  },
  {
    combo: 'M',
    description: __('Mute or unmute'),
    group: __('Memories'),
    enabled: keys,
    handler: () => (muted.value = !muted.value),
  },
  { combo: 'Escape', description: __('Close'), group: __('Memories'), enabled: keys, handler: close },
])

function share() {
  if (photo.value) openShare([photo.value.name])
}

const menu = computed(() => {
  const current = photo.value
  if (!current) return []
  return [
    {
      label: isVideo(current) ? __('Remove video from this memory') : __('Remove photo from this memory'),
      onClick: () => removeCurrent(current.name),
    },
    ...(people.value.length
      ? [{ label: __('Hide faces from memories'), onClick: () => (hidingFaces.value = true) }]
      : []),
  ]
})

async function removeCurrent(name: string) {
  try {
    await removeFromMemories(name)
  } catch (error) {
    return toast.error(errorText(error) || __('Could not remove it'))
  }
  dropFromStory((item) => item.name === name)
  toast.success(__('Removed from this memory'))
}

function onFacesHidden(hidden: Set<string>) {
  const name = photo.value?.name
  if (name && people.value.some((entry) => hidden.has(entry.person))) {
    dropFromStory((item) => item.name === name)
    hidingFaces.value = false
  }
}

function dropFromStory(matches: (item: { name: string }) => boolean) {
  memoriesVersion.value++
  const current = memory.value
  if (!current) return close()
  current.photos = current.photos.filter((item) => !matches(item))
  if (current.photos.length) {
    story.index = Math.min(story.index, current.photos.length - 1)
    progress.value = 0
    return
  }
  story.memories.splice(story.memory, 1)
  if (!story.memories.length) return close()
  story.memory = Math.min(story.memory, story.memories.length - 1)
  story.index = 0
}
useBackClose(() => story.open, close)

function next() {
  if (!memory.value) return close()
  if (story.index < memory.value.photos.length - 1) story.index++
  else if (story.memory < story.memories.length - 1) {
    story.memory++
    story.index = 0
  } else close()
}

function previous() {
  if (story.index > 0) story.index--
  else if (story.memory > 0) {
    story.memory--
    story.index = story.memories[story.memory].photos.length - 1
  } else progress.value = 0
}

function tick(time: number) {
  if (!story.open) return
  const elapsed = last ? time - last : 0
  last = time
  if (!paused.value && photo.value && !isVideo(photo.value)) {
    progress.value = Math.min(1, progress.value + elapsed / PHOTO_MS)
    if (progress.value >= 1) next()
  }
  frame = requestAnimationFrame(tick)
}

watch(
  () => [story.open, story.memory, story.index] as const,
  ([open]) => {
    progress.value = 0
    cancelAnimationFrame(frame)
    last = 0
    if (!open) return
    frame = requestAnimationFrame(tick)
    const upcoming = memory.value?.photos[story.index + 1]
    if (upcoming && !isVideo(upcoming)) new Image().src = contentUrl(upcoming.name)
  },
)

function onDown(event: PointerEvent) {
  downAt = Date.now()
  downX = event.clientX
  downY = event.clientY
  paused.value = true
}

function onUp(event: PointerEvent) {
  paused.value = held.value
  if (event.clientY - downY > 80) return close()
  if (Date.now() - downAt > HOLD_MS || Math.abs(event.clientX - downX) > 30) return
  if (downX < window.innerWidth / 3) previous()
  else next()
}

const onCancel = () => (paused.value = held.value)

if (import.meta.env.VITE_NATIVE)
  watch(
    () => story.open,
    (open) => import('../native/bars').then(({ viewerBars }) => viewerBars(open, !open)),
  )

onBeforeUnmount(() => cancelAnimationFrame(frame))
</script>

<style scoped>
.story-image {
  animation-name: story-zoom;
  animation-timing-function: linear;
  animation-fill-mode: forwards;
}
@keyframes story-zoom {
  from {
    transform: scale(1);
  }
  to {
    transform: scale(1.08);
  }
}
.story-button {
  display: flex;
  height: 2.5rem;
  width: 2.5rem;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
}
</style>
