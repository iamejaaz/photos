<template>
  <Teleport to="body">
    <div v-if="photo" class="fixed inset-0 z-[60] flex flex-col bg-black text-white">
      <div class="flex items-center justify-between p-3">
        <button class="editor-button" :aria-label="__('Cancel')" @click="emit('close')">
          <LucideX class="size-5" />
        </button>
        <div class="flex items-center gap-2">
          <button class="rounded-full px-4 py-2 text-sm text-white/80 hover:bg-white/10" @click="reset">
            {{ __('Reset') }}
          </button>
          <Button variant="solid" :loading="saving" :disabled="!ready" @click="save">{{
            __('Save copy')
          }}</Button>
        </div>
      </div>

      <div class="flex min-h-0 flex-1 items-center justify-center p-4">
        <div v-show="ready" ref="stage" class="relative max-h-full max-w-full overflow-hidden">
          <canvas ref="canvas" class="block max-h-[calc(100vh-14rem)] max-w-full" />
          <div
            v-if="active === 'crop'"
            class="absolute cursor-move border border-white/90"
            :style="{
              left: `${state.crop.x * 100}%`,
              top: `${state.crop.y * 100}%`,
              width: `${state.crop.w * 100}%`,
              height: `${state.crop.h * 100}%`,
              boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.55)',
            }"
            @pointerdown.prevent="startDrag($event, 'move')"
          >
            <div class="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
              <span v-for="i in 9" :key="i" class="border border-white/20" />
            </div>
            <span
              v-for="corner in CORNERS"
              :key="corner"
              class="absolute size-5 rounded-sm border-2 border-black/30 bg-white shadow"
              :class="cornerClass[corner]"
              @pointerdown.prevent.stop="startDrag($event, corner)"
            />
          </div>
        </div>
        <LoadingIndicator v-if="!ready" class="size-6" />
      </div>

      <div class="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4">
        <div class="flex justify-center gap-1">
          <button
            v-for="tab in tabs"
            :key="tab.value"
            class="rounded-full px-4 py-1.5 text-sm"
            :class="active === tab.value ? 'bg-white text-black' : 'text-white/80 hover:bg-white/10'"
            @click="active = tab.value"
          >
            {{ tab.label }}
          </button>
        </div>

        <div v-if="active === 'filters'" class="flex justify-center gap-3 overflow-x-auto pb-1">
          <button
            v-for="filter in FILTERS"
            :key="filter.name"
            class="flex w-20 shrink-0 flex-col items-center gap-1.5 text-xs"
            @click="state.filter = filter.name"
          >
            <img
              :src="thumbnailUrl(photo.name)"
              class="size-16 rounded-lg object-cover"
              :class="{ 'ring-2 ring-white ring-offset-2 ring-offset-black': state.filter === filter.name }"
              :style="{ filter: filter.css }"
              alt=""
            />
            {{ filter.label }}
          </button>
        </div>

        <div v-else-if="active === 'adjust'" class="grid gap-3 sm:grid-cols-2">
          <label v-for="slider in SLIDERS" :key="slider.key" class="flex items-center gap-3 text-sm">
            <span class="w-24 shrink-0 text-white/80">{{ slider.label }}</span>
            <input
              v-model.number="state[slider.key]"
              type="range"
              min="-100"
              max="100"
              class="flex-1 accent-white"
            />
            <span class="w-8 text-right tabular-nums text-white/60">{{ state[slider.key] }}</span>
          </label>
        </div>

        <div v-else class="flex flex-wrap items-center justify-center gap-2">
          <button
            v-for="ratio in RATIOS"
            :key="ratio.label"
            class="rounded-full px-3 py-1.5 text-sm"
            :class="state.ratio === ratio.value ? 'bg-white text-black' : 'text-white/80 hover:bg-white/10'"
            @click="setRatio(ratio.value)"
          >
            {{ ratio.label }}
          </button>
          <span class="mx-2 h-5 w-px bg-white/20" />
          <button class="editor-button" :aria-label="__('Rotate')" @click="rotate">
            <LucideRotateCw class="size-5" />
          </button>
          <button class="editor-button" :aria-label="__('Flip')" @click="state.flip = !state.flip">
            <LucideFlipHorizontal2 class="size-5" />
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { Button, LoadingIndicator, toast } from 'frappe-ui'
import LucideFlipHorizontal2 from '~icons/lucide/flip-horizontal-2'
import LucideRotateCw from '~icons/lucide/rotate-cw'
import LucideX from '~icons/lucide/x'

import { type Photo, contentUrl, getUploadFolder, thumbnailUrl, uploadFile } from '../api'

const props = defineProps<{ photo: Photo | null; folder?: string | null }>()
const emit = defineEmits<{ close: []; saved: [] }>()

type SliderKey = 'brightness' | 'contrast' | 'saturation' | 'warmth'
const FILTERS = [
  { name: 'none', label: __('Original'), css: 'none' },
  { name: 'vivid', label: __('Vivid'), css: 'saturate(1.45) contrast(1.1)' },
  { name: 'mono', label: __('Mono'), css: 'grayscale(1) contrast(1.1)' },
  { name: 'warm', label: __('Warm'), css: 'sepia(0.3) saturate(1.2) hue-rotate(-8deg)' },
  { name: 'cool', label: __('Cool'), css: 'saturate(0.9) hue-rotate(12deg) brightness(1.03)' },
  { name: 'fade', label: __('Fade'), css: 'contrast(0.82) brightness(1.08) saturate(0.75)' },
]
const SLIDERS: { key: SliderKey; label: string }[] = [
  { key: 'brightness', label: __('Brightness') },
  { key: 'contrast', label: __('Contrast') },
  { key: 'saturation', label: __('Saturation') },
  { key: 'warmth', label: __('Warmth') },
]
const CORNERS = ['nw', 'ne', 'sw', 'se'] as const
type Corner = (typeof CORNERS)[number]
const cornerClass: Record<Corner, string> = {
  nw: 'left-0 top-0 cursor-nwse-resize',
  ne: 'right-0 top-0 cursor-nesw-resize',
  sw: 'bottom-0 left-0 cursor-nesw-resize',
  se: 'bottom-0 right-0 cursor-nwse-resize',
}
const MIN_CROP = 0.05
const RATIOS = [
  { label: __('Free'), value: 0 },
  { label: __('Square'), value: 1 },
  { label: '4:3', value: 4 / 3 },
  { label: '3:4', value: 3 / 4 },
  { label: '16:9', value: 16 / 9 },
]
const tabs = [
  { value: 'crop', label: __('Crop') },
  { value: 'adjust', label: __('Adjust') },
  { value: 'filters', label: __('Filters') },
] as const

const initial = () => ({
  filter: 'none',
  brightness: 0,
  contrast: 0,
  saturation: 0,
  warmth: 0,
  rotation: 0,
  flip: false,
  ratio: 0,
  crop: { x: 0, y: 0, w: 1, h: 1 },
})
const state = reactive(initial())
const active = ref<'crop' | 'adjust' | 'filters'>('crop')
const canvas = ref<HTMLCanvasElement>()
const stage = ref<HTMLElement>()
const ready = ref(false)
const saving = ref(false)
let source: HTMLImageElement | null = null

const reset = () => Object.assign(state, initial())

function cssFilter() {
  const parts = [FILTERS.find((f) => f.name === state.filter)?.css ?? 'none']
  parts.push(`brightness(${1 + state.brightness / 200})`)
  parts.push(`contrast(${1 + state.contrast / 200})`)
  parts.push(`saturate(${1 + state.saturation / 100})`)
  if (state.warmth > 0) parts.push(`sepia(${state.warmth / 250})`)
  if (state.warmth < 0) parts.push(`hue-rotate(${state.warmth / 6}deg)`)
  return parts.filter((p) => p !== 'none').join(' ') || 'none'
}

function fullSize() {
  const turned = state.rotation % 180 !== 0
  return {
    width: turned ? source!.naturalHeight : source!.naturalWidth,
    height: turned ? source!.naturalWidth : source!.naturalHeight,
  }
}

function render(target: HTMLCanvasElement, maxSide: number, cropped: boolean) {
  if (!source) return
  const full = fullSize()
  const crop = cropped ? state.crop : { x: 0, y: 0, w: 1, h: 1 }
  const scale = Math.min(1, maxSide / Math.max(full.width * crop.w, full.height * crop.h))

  const whole = document.createElement('canvas')
  whole.width = Math.round(full.width * scale)
  whole.height = Math.round(full.height * scale)
  const wctx = whole.getContext('2d')!
  wctx.filter = cssFilter()
  wctx.translate(whole.width / 2, whole.height / 2)
  wctx.rotate((state.rotation * Math.PI) / 180)
  if (state.flip) wctx.scale(-1, 1)
  wctx.drawImage(
    source,
    (-source.naturalWidth * scale) / 2,
    (-source.naturalHeight * scale) / 2,
    source.naturalWidth * scale,
    source.naturalHeight * scale,
  )

  target.width = Math.max(1, Math.round(whole.width * crop.w))
  target.height = Math.max(1, Math.round(whole.height * crop.h))
  target
    .getContext('2d')!
    .drawImage(
      whole,
      whole.width * crop.x,
      whole.height * crop.y,
      target.width,
      target.height,
      0,
      0,
      target.width,
      target.height,
    )
}

function setRatio(ratio: number) {
  state.ratio = ratio
  if (!source) return
  if (!ratio) {
    state.crop = { x: 0, y: 0, w: 1, h: 1 }
    return
  }
  const full = fullSize()
  let w = 1
  let h = full.width / full.height / ratio
  if (h > 1) {
    w = 1 / h
    h = 1
  }
  state.crop = { x: (1 - w) / 2, y: (1 - h) / 2, w, h }
}

function rotate() {
  state.rotation = (state.rotation + 90) % 360
  setRatio(state.ratio)
}

let drag: { mode: 'move' | Corner; startX: number; startY: number; crop: typeof state.crop } | null = null

function startDrag(event: PointerEvent, mode: 'move' | Corner) {
  drag = { mode, startX: event.clientX, startY: event.clientY, crop: { ...state.crop } }
  window.addEventListener('pointermove', onDrag)
  window.addEventListener('pointerup', endDrag, { once: true })
}

function onDrag(event: PointerEvent) {
  const rect = stage.value?.getBoundingClientRect()
  if (!drag || !rect || !source) return
  const dx = (event.clientX - drag.startX) / rect.width
  const dy = (event.clientY - drag.startY) / rect.height
  const start = drag.crop
  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

  if (drag.mode === 'move') {
    state.crop = {
      ...start,
      x: clamp(start.x + dx, 0, 1 - start.w),
      y: clamp(start.y + dy, 0, 1 - start.h),
    }
    return
  }

  const left = drag.mode.includes('w')
  const top = drag.mode.includes('n')
  const right = start.x + start.w
  const bottom = start.y + start.h
  let w = clamp(left ? start.w - dx : start.w + dx, MIN_CROP, left ? right : 1 - start.x)
  let h = clamp(top ? start.h - dy : start.h + dy, MIN_CROP, top ? bottom : 1 - start.y)
  if (state.ratio) {
    const full = fullSize()
    const fit = full.width / full.height / state.ratio
    h = w * fit
    const maxH = top ? bottom : 1 - start.y
    if (h > maxH) {
      h = maxH
      w = h / fit
    }
  }
  state.crop = { x: left ? right - w : start.x, y: top ? bottom - h : start.y, w, h }
}

function endDrag() {
  drag = null
  window.removeEventListener('pointermove', onDrag)
}

watch(
  () => props.photo?.name,
  (name) => {
    ready.value = false
    reset()
    if (!name) return
    const image = new Image()
    image.onload = () => {
      source = image
      ready.value = true
      draw()
    }
    image.src = contentUrl(name)
  },
  { immediate: true },
)

function draw() {
  if (canvas.value) render(canvas.value, 1600, active.value !== 'crop')
}
watch([state, active], draw, { deep: true })

async function save() {
  if (!props.photo || !source) return
  saving.value = true
  try {
    const output = document.createElement('canvas')
    render(output, 8000, true)
    const blob = await new Promise<Blob | null>((resolve) => output.toBlob(resolve, 'image/jpeg', 0.92))
    if (!blob) throw new Error(__('Could not export the image'))
    const base = props.photo.file_name.replace(/\.[^.]+$/, '')
    const file = new File([blob], `${base}-edited.jpg`, {
      type: 'image/jpeg',
      lastModified: new Date(props.photo.taken).getTime(),
    })
    try {
      if (!props.folder) throw new Error()
      await uploadFile(file, props.folder, () => {})
    } catch {
      await uploadFile(file, await getUploadFolder(), () => {})
    }
    toast.success(__('Saved a copy next to the original'))
    emit('saved')
    emit('close')
  } catch (error) {
    toast.error((error as Error).message || __('Could not save'))
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.editor-button {
  @apply flex size-10 items-center justify-center rounded-full text-white/90 transition-colors hover:bg-white/15 hover:text-white;
}
</style>
