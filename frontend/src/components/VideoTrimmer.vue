<template>
  <Teleport to="body">
    <div v-if="photo" class="fixed inset-0 z-[60] flex flex-col bg-black text-white">
      <div class="flex items-center justify-between p-3">
        <button class="trim-button" :aria-label="__('Cancel')" @click="emit('close')">
          <LucideX class="size-5" />
        </button>
        <Button variant="solid" :loading="saving" :disabled="!duration || length < MIN_LENGTH" @click="save">
          {{ __('Save copy') }}
        </Button>
      </div>

      <div class="flex min-h-0 flex-1 items-center justify-center p-4">
        <video
          ref="video"
          :src="streamUrl(photo.name, photo.album)"
          :poster="thumbnailUrl(photo.name, photo.album, true)"
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
          <span>{{ clock(position) }} / {{ clock(length) }}</span>
          <div class="flex items-center gap-1">
            <button
              class="trim-button"
              :aria-label="muted ? __('Keep sound') : __('Remove sound')"
              :class="{ 'bg-white/15': muted }"
              @click="muted = !muted"
            >
              <component :is="muted ? LucideVolumeX : LucideVolume2" class="size-5" />
            </button>
            <button
              class="trim-button"
              :aria-label="__('Save this frame as a photo')"
              :disabled="savingFrame"
              @click="saveFrame"
            >
              <LoadingIndicator v-if="savingFrame" class="size-5" />
              <LucideImageDown v-else class="size-5" />
            </button>
          </div>
        </div>

        <div class="px-4">
          <div v-if="!duration" class="flex h-14 items-center justify-center rounded-md bg-white/10">
            <LoadingIndicator class="size-5 text-white/70" />
          </div>
          <div v-else ref="track" class="relative h-14 touch-none select-none" @pointerdown="scrub">
            <div class="absolute inset-0 flex overflow-hidden rounded-md bg-white/10">
              <img
                v-for="(frame, index) in frames"
                :key="index"
                :src="frame"
                class="h-full min-w-0 flex-1 object-cover"
                draggable="false"
                alt=""
              />
            </div>
            <div
              v-for="(part, index) in parts"
              :key="`${part.start}-${part.end}`"
              class="absolute inset-y-0"
              :class="[
                part.removed ? 'bg-black/75' : '',
                index === selected ? 'z-10 rounded-sm ring-2 ring-inset ring-[#facc15]' : '',
              ]"
              :style="{ left: `${percent(part.start)}%`, width: `${percent(part.end - part.start)}%` }"
            >
              <LucideTrash2
                v-if="part.removed"
                class="absolute left-1/2 top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 text-white/70"
              />
            </div>
            <div
              v-for="cut in cuts"
              :key="cut"
              class="pointer-events-none absolute inset-y-0 w-1 -translate-x-1/2 bg-black"
              :style="{ left: `${percent(cut)}%` }"
            />
            <div
              class="absolute inset-y-0 left-0 rounded-l-md bg-black/75"
              :style="{ width: `${percent(range.start)}%` }"
            />
            <div
              class="absolute inset-y-0 right-0 rounded-r-md bg-black/75"
              :style="{ width: `${100 - percent(range.end)}%` }"
            />
            <div
              class="pointer-events-none absolute inset-y-0 border-y-2 border-white"
              :style="{ left: `${percent(range.start)}%`, right: `${100 - percent(range.end)}%` }"
            />
            <div
              class="pointer-events-none absolute -inset-y-2 w-0.5 -translate-x-1/2 bg-white"
              :style="{ left: `${percent(current)}%` }"
            >
              <div class="absolute -top-1 left-1/2 size-3 -translate-x-1/2 rounded-full bg-white" />
            </div>
            <button
              v-for="edge in EDGES"
              :key="edge"
              class="absolute inset-y-0 flex w-5 cursor-ew-resize touch-none items-center justify-center bg-white text-black after:absolute after:-inset-x-3 after:inset-y-0"
              :class="edge === 'start' ? 'rounded-l-md' : '-translate-x-full rounded-r-md'"
              :style="{ left: `${percent(range[edge])}%` }"
              :aria-label="edge === 'start' ? __('Start') : __('End')"
              @pointerdown.stop.prevent="drag($event, edge)"
            >
              <component :is="edge === 'start' ? LucideChevronLeft : LucideChevronRight" class="size-4" />
            </button>
          </div>
          <p class="mt-2 min-h-4 text-center text-xs text-white/60">
            {{
              cuts.length
                ? selected === null
                  ? __('Tap a part to select it')
                  : ''
                : __('Drag the ends to trim, or Split at the white line')
            }}
          </p>
        </div>

        <div class="mt-3 flex items-center justify-center gap-2">
          <button
            class="flex min-w-[5rem] flex-col items-center gap-1 rounded-md px-3 py-2 text-xs text-white/90 hover:bg-white/15 disabled:opacity-40 disabled:hover:bg-transparent"
            :disabled="!canSplit"
            @click="split"
          >
            <LucideScissors class="size-5" />
            {{ __('Split') }}
          </button>
          <button
            class="flex min-w-[5rem] flex-col items-center gap-1 rounded-md px-3 py-2 text-xs text-white/90 hover:bg-white/15 disabled:opacity-40 disabled:hover:bg-transparent"
            :disabled="selected === null || (!parts[selected]?.removed && !canRemove)"
            @click="toggleRemoved"
          >
            <component :is="parts[selected ?? -1]?.removed ? LucideRotateCcw : LucideTrash2" class="size-5" />
            {{ parts[selected ?? -1]?.removed ? __('Keep part') : __('Delete part') }}
          </button>
          <button
            class="flex min-w-[5rem] flex-col items-center gap-1 rounded-md px-3 py-2 text-xs text-white/90 hover:bg-white/15 disabled:opacity-40 disabled:hover:bg-transparent"
            :disabled="!history.length"
            @click="undo"
          >
            <LucideUndo2 class="size-5" />
            {{ __('Undo') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { Button, LoadingIndicator, toast } from 'frappe-ui'
import LucideChevronLeft from '~icons/lucide/chevron-left'
import LucideChevronRight from '~icons/lucide/chevron-right'
import LucidePause from '~icons/lucide/pause'
import LucideImageDown from '~icons/lucide/image-down'
import LucidePlay from '~icons/lucide/play'
import LucideRotateCcw from '~icons/lucide/rotate-ccw'
import LucideScissors from '~icons/lucide/scissors'
import LucideTrash2 from '~icons/lucide/trash-2'
import LucideUndo2 from '~icons/lucide/undo-2'
import LucideVolume2 from '~icons/lucide/volume-2'
import LucideVolumeX from '~icons/lucide/volume-x'
import LucideX from '~icons/lucide/x'

import { type Photo } from '../resources/photos'
import { exportFrame, trimVideo } from '../resources/edit'
import { streamUrl, thumbnailUrl } from '../resources/media'
import { notifyUploaded } from '../data/uploads'
import { useBackClose } from '../composables/useBackClose'
import { errorText } from '../resources/drive'
import { addToAlbum } from '../resources/albums'

type Part = { start: number; end: number; removed: boolean }
type Snapshot = { cuts: number[]; removed: number[]; start: number; end: number }

const props = defineProps<{ photo: Photo | null; album?: string | null }>()
const emit = defineEmits<{ close: [] }>()

const EDGES = ['start', 'end'] as const
const MIN_LENGTH = 0.5
const MIN_PART = 0.3
const FRAME_COUNT = 8

const video = ref<HTMLVideoElement>()
const savingFrame = ref(false)
const track = ref<HTMLElement>()
const duration = ref(0)
const current = ref(0)
const playing = ref(false)
const saving = ref(false)
const muted = ref(false)
const range = reactive({ start: 0, end: 0 })
const cuts = ref<number[]>([])
const removed = ref(new Set<number>())
const selected = ref<number | null>(null)
const history = ref<Snapshot[]>([])
const frames = ref<string[]>([])

const parts = computed<Part[]>(() => {
  const edges = [0, ...cuts.value, duration.value]
  return edges
    .slice(1)
    .map((end, index) => ({ start: edges[index], end, removed: removed.value.has(edges[index]) }))
})

const kept = computed(() => {
  const spans: [number, number][] = []
  for (const part of parts.value) {
    if (part.removed) continue
    const start = Math.max(part.start, range.start)
    const end = Math.min(part.end, range.end)
    if (end - start < 0.05) continue
    const last = spans[spans.length - 1]
    if (last && Math.abs(last[1] - start) < 0.01) last[1] = end
    else spans.push([start, end])
  }
  return spans
})

const length = computed(() => kept.value.reduce((total, [start, end]) => total + end - start, 0))

const position = computed(() =>
  kept.value.reduce((total, [start, end]) => total + Math.max(0, Math.min(end, current.value) - start), 0),
)

const partAt = (time: number) => parts.value.findIndex((part) => time >= part.start && time < part.end)

const canSplit = computed(() => {
  const time = current.value
  if (!duration.value || time <= range.start + MIN_PART || time >= range.end - MIN_PART) return false
  const part = parts.value[partAt(time)]
  return Boolean(part) && time - part.start >= MIN_PART && part.end - time >= MIN_PART
})

const canRemove = computed(() => {
  if (selected.value === null) return false
  const part = parts.value[selected.value]
  const inside = Math.max(0, Math.min(part.end, range.end) - Math.max(part.start, range.start))
  return length.value - inside >= MIN_LENGTH
})

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
    cuts.value = []
    removed.value = new Set()
    selected.value = null
    history.value = []
    frames.value = props.photo
      ? Array(FRAME_COUNT).fill(thumbnailUrl(props.photo.name, props.photo.album))
      : []
    if (props.photo) loadFrames(props.photo)
  },
  { immediate: true },
)

function once(element: HTMLVideoElement, name: string) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), 10_000)
    element.addEventListener(name, () => (clearTimeout(timer), resolve()), { once: true })
  })
}

async function loadFrames(photo: Photo) {
  const probe = document.createElement('video')
  probe.muted = true
  probe.playsInline = true
  probe.preload = 'auto'
  probe.src = streamUrl(photo.name, photo.album)
  try {
    await once(probe, 'loadeddata')
    const canvas = document.createElement('canvas')
    canvas.height = 96
    canvas.width = Math.round((96 * probe.videoWidth) / (probe.videoHeight || 1)) || 96
    const context = canvas.getContext('2d')!
    for (let index = 0; index < FRAME_COUNT; index++) {
      if (props.photo?.name !== photo.name) return
      probe.currentTime = ((index + 0.5) * probe.duration) / FRAME_COUNT
      await once(probe, 'seeked')
      context.drawImage(probe, 0, 0, canvas.width, canvas.height)
      frames.value[index] = canvas.toDataURL('image/jpeg', 0.7)
    }
  } catch {
  } finally {
    probe.removeAttribute('src')
    probe.load()
  }
}

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

function remember() {
  history.value.push({
    cuts: [...cuts.value],
    removed: [...removed.value],
    start: range.start,
    end: range.end,
  })
}

function undo() {
  const last = history.value.pop()
  if (!last) return
  cuts.value = last.cuts
  removed.value = new Set(last.removed)
  range.start = last.start
  range.end = last.end
  selected.value = null
}

function split() {
  if (!canSplit.value) return
  remember()
  const time = current.value
  const part = parts.value[partAt(time)]
  cuts.value = [...cuts.value, time].sort((a, b) => a - b)
  if (part.removed) removed.value = new Set([...removed.value, time])
  selected.value = partAt(time)
}

function toggleRemoved() {
  if (selected.value === null) return
  const part = parts.value[selected.value]
  if (!part.removed && !canRemove.value) return
  remember()
  const next = new Set(removed.value)
  if (part.removed) next.delete(part.start)
  else next.add(part.start)
  removed.value = next
  if (!part.removed) seek(nextKept(part.end) ?? kept.value[0]?.[0] ?? 0)
}

const nextKept = (time: number) => kept.value.find(([, end]) => end > time + 0.01)?.[0]

function seek(time: number) {
  current.value = time
  if (video.value) video.value.currentTime = time
}

function keepInside() {
  const element = video.value
  if (!element || !kept.value.length) return
  const time = element.currentTime
  current.value = time
  const inside = kept.value.some(([start, end]) => time >= start - 0.05 && time < end)
  if (inside) return
  const next = kept.value.find(([start]) => start > time)
  element.currentTime = next ? next[0] : kept.value[0][0]
  if (!next && !element.paused) element.play()
}

function toggle() {
  const element = video.value
  if (!element) return
  if (element.paused) {
    if (!kept.value.some(([start, end]) => element.currentTime >= start && element.currentTime < end))
      element.currentTime = nextKept(element.currentTime) ?? kept.value[0]?.[0] ?? 0
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

function follow(event: PointerEvent, onMove: (moved: PointerEvent) => void) {
  const stop = () => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', stop)
    window.removeEventListener('pointercancel', stop)
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', stop)
  window.addEventListener('pointercancel', stop)
}

function scrub(event: PointerEvent) {
  if (!duration.value) return
  video.value?.pause()
  playing.value = false
  const time = timeAt(event)
  selected.value = cuts.value.length ? partAt(time) : null
  seek(Math.min(range.end, Math.max(range.start, time)))
  follow(event, (moved) => seek(Math.min(range.end, Math.max(range.start, timeAt(moved)))))
}

function drag(event: PointerEvent, edge: 'start' | 'end') {
  remember()
  follow(event, (moved) => {
    const time = timeAt(moved)
    if (edge === 'start') range.start = Math.max(0, Math.min(time, range.end - MIN_LENGTH))
    else range.end = Math.min(duration.value, Math.max(time, range.start + MIN_LENGTH))
    seek(range[edge])
  })
}

async function saveFrame() {
  if (!props.photo || !video.value || savingFrame.value) return
  video.value.pause()
  playing.value = false
  savingFrame.value = true
  try {
    const frame = await exportFrame(props.photo.name, video.value.currentTime)
    if (props.album) await addToAlbum(props.album, [frame])
    notifyUploaded()
    toast.success(__('Frame saved as a photo'))
  } catch (error) {
    toast.error(errorText(error) || __('Could not save this frame'))
  } finally {
    savingFrame.value = false
  }
}

async function save() {
  if (!props.photo || length.value < MIN_LENGTH) return
  saving.value = true
  try {
    await trimVideo(props.photo.name, kept.value, muted.value, props.album)
    toast.success(__('Saving your video. The new copy will appear in Photos when it is ready.'))
    emit('close')
  } catch (error) {
    toast.error(errorText(error) || __('Could not trim this video'))
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
