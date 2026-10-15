<template>
  <Teleport to="body">
    <div v-if="photo" class="fixed inset-0 z-[60] flex flex-col bg-black text-white">
      <div class="flex items-center justify-between p-3">
        <button class="trim-button" :aria-label="__('Cancel')" @click="emit('close')">
          <LucideX class="size-5" />
        </button>
        <Button variant="solid" :loading="saving" :disabled="!duration" @click="save">
          {{ __('Save copy') }}
        </Button>
      </div>

      <div class="flex min-h-0 flex-1 items-center justify-center p-4">
        <video
          ref="video"
          :src="streamUrl(photo.name, photo.album)"
          class="max-h-full max-w-full"
          playsinline
          @loadedmetadata="loaded"
          @timeupdate="keepInside"
          @click="toggle"
        />
      </div>

      <div class="mx-auto w-full max-w-3xl px-4 pb-6">
        <div class="mb-3 flex items-center justify-between text-sm text-white/80">
          <button class="trim-button" :aria-label="playing ? __('Pause') : __('Play')" @click="toggle">
            <component :is="playing ? LucidePause : LucidePlay" class="size-5" />
          </button>
          <span
            >{{ clock(range.start) }} – {{ clock(range.end) }} · {{ clock(range.end - range.start) }}</span
          >
        </div>
        <div ref="track" class="relative h-12 select-none rounded-md bg-white/10" @pointerdown="seekTo">
          <div
            class="absolute inset-y-0 rounded-md border-2 border-white bg-white/15"
            :style="{ left: `${percent(range.start)}%`, right: `${100 - percent(range.end)}%` }"
          />
          <div class="absolute inset-y-0 w-0.5 bg-white/70" :style="{ left: `${percent(current)}%` }" />
          <button
            v-for="edge in EDGES"
            :key="edge"
            class="absolute inset-y-0 w-4 -translate-x-1/2 cursor-ew-resize rounded bg-white"
            :style="{ left: `${percent(range[edge])}%` }"
            :aria-label="edge === 'start' ? __('Start') : __('End')"
            @pointerdown.stop.prevent="drag($event, edge)"
          />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { Button, toast } from 'frappe-ui'
import LucidePause from '~icons/lucide/pause'
import LucidePlay from '~icons/lucide/play'
import LucideX from '~icons/lucide/x'

import { type Photo, streamUrl, trimVideo } from '../api'
import { useBackClose } from '../composables/useBackClose'

const props = defineProps<{ photo: Photo | null }>()
const emit = defineEmits<{ close: [] }>()

const EDGES = ['start', 'end'] as const
const MIN_LENGTH = 0.5

const video = ref<HTMLVideoElement>()
const track = ref<HTMLElement>()
const duration = ref(0)
const current = ref(0)
const playing = ref(false)
const saving = ref(false)
const range = reactive({ start: 0, end: 0 })
useBackClose(
  () => Boolean(props.photo),
  () => emit('close'),
)

watch(
  () => props.photo?.name,
  () => {
    duration.value = 0
    current.value = 0
    playing.value = false
  },
)

const percent = (seconds: number) => (duration.value ? (seconds / duration.value) * 100 : 0)
const clock = (seconds: number) => {
  const whole = Math.max(0, seconds)
  const minutes = Math.floor(whole / 60)
  return `${minutes}:${(whole - minutes * 60).toFixed(1).padStart(4, '0')}`
}

function loaded() {
  duration.value = video.value?.duration || 0
  range.start = 0
  range.end = duration.value
}

function keepInside() {
  const element = video.value
  if (!element) return
  current.value = element.currentTime
  if (element.currentTime >= range.end) {
    element.currentTime = range.start
    if (!element.paused) element.play()
  }
}

function toggle() {
  const element = video.value
  if (!element) return
  if (element.paused) {
    if (element.currentTime < range.start || element.currentTime >= range.end)
      element.currentTime = range.start
    element.play()
    playing.value = true
  } else {
    element.pause()
    playing.value = false
  }
}

const timeAt = (event: PointerEvent) => {
  const box = track.value!.getBoundingClientRect()
  return Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)) * duration.value
}

function seekTo(event: PointerEvent) {
  if (!video.value || !duration.value) return
  video.value.currentTime = Math.min(range.end, Math.max(range.start, timeAt(event)))
}

function drag(event: PointerEvent, edge: 'start' | 'end') {
  const move = (moved: PointerEvent) => {
    const time = timeAt(moved)
    if (edge === 'start') range.start = Math.min(time, range.end - MIN_LENGTH)
    else range.end = Math.max(time, range.start + MIN_LENGTH)
    range.start = Math.max(0, range.start)
    range.end = Math.min(duration.value, range.end)
    if (video.value) video.value.currentTime = range[edge]
  }
  const stop = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', stop)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', stop)
}

async function save() {
  if (!props.photo) return
  saving.value = true
  try {
    await trimVideo(props.photo.name, range.start, range.end)
    toast.success(__('Trimming. The new copy will appear in Photos when it is ready.'))
    emit('close')
  } catch (error) {
    toast.error((error as Error).message || __('Could not trim this video'))
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.trim-button {
  @apply flex size-10 items-center justify-center rounded-full text-white/90 transition-colors hover:bg-white/15 hover:text-white;
}
</style>
