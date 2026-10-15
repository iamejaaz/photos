<template>
  <Teleport to="body">
    <div
      v-if="story.open && memory && photo"
      class="edge-to-edge fixed inset-0 z-[55] select-none bg-black text-white"
      @pointerdown="onDown"
      @pointerup="onUp"
      @pointercancel="onCancel"
      @contextmenu.prevent
    >
      <div class="absolute inset-0 overflow-hidden">
        <video
          v-if="isVideo(photo)"
          :key="photo.name"
          :src="streamUrl(photo.name)"
          class="size-full object-contain"
          autoplay
          muted
          playsinline
          @ended="next"
        />
        <img
          v-else
          :key="photo.name"
          :src="contentUrl(photo.name)"
          class="story-image size-full object-contain"
          :style="{ animationDuration: `${PHOTO_MS}ms`, animationPlayState: paused ? 'paused' : 'running' }"
          draggable="false"
          alt=""
        />
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
          <button class="story-button" :aria-label="__('Close')" @pointerdown.stop @click="close">
            <LucideX class="size-5" />
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import dayjs from 'dayjs'
import LucideX from '~icons/lucide/x'

import { contentUrl, isVideo, streamUrl } from '../api'
import { useBackClose } from '../composables/useBackClose'
import { memoryStory as story } from '../store'

const PHOTO_MS = 5000
const HOLD_MS = 220

const memory = computed(() => story.memories[story.memory])
const photo = computed(() => memory.value?.photos[story.index])
const progress = ref(0)
const paused = ref(false)
const takenLabel = computed(() => (photo.value ? dayjs(photo.value.taken).format('D MMM YYYY') : ''))

let frame = 0
let last = 0
let downAt = 0
let downX = 0
let downY = 0

function close() {
  story.open = false
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
  paused.value = false
  if (event.clientY - downY > 80) return close()
  if (Date.now() - downAt > HOLD_MS || Math.abs(event.clientX - downX) > 30) return
  if (downX < window.innerWidth / 3) previous()
  else next()
}

const onCancel = () => (paused.value = false)

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
