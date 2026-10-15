<template>
  <Dialog v-model:open="collage.open" :title="__('Create collage')" size="3xl">
    <div class="flex flex-col gap-4 sm:flex-row">
      <div class="flex flex-1 items-center justify-center rounded-lg bg-surface-gray-2 p-3">
        <canvas v-show="ready" ref="canvas" class="max-h-[55vh] max-w-full rounded shadow-sm" />
        <LoadingIndicator v-if="!ready" class="size-5" />
      </div>
      <div class="flex w-full flex-col gap-4 sm:w-56">
        <div>
          <div class="mb-2 text-sm text-ink-gray-5">{{ __('Layout') }}</div>
          <div class="grid grid-cols-3 gap-2">
            <button
              v-for="(layout, index) in layouts"
              :key="index"
              class="aspect-square rounded border p-1"
              :class="
                index === layoutIndex ? 'border-outline-gray-5 bg-surface-gray-2' : 'border-outline-gray-2'
              "
              :aria-label="__('Layout {0}', [index + 1])"
              @click="layoutIndex = index"
            >
              <div class="relative size-full">
                <span
                  v-for="(cell, i) in layout.cells"
                  :key="i"
                  class="absolute rounded-sm bg-surface-gray-5"
                  :style="{
                    left: `${cell[0] * 100 + 2}%`,
                    top: `${cell[1] * 100 + 2}%`,
                    width: `${cell[2] * 100 - 4}%`,
                    height: `${cell[3] * 100 - 4}%`,
                  }"
                />
              </div>
            </button>
          </div>
        </div>
        <label class="flex flex-col gap-2 text-sm text-ink-gray-5">
          {{ __('Spacing') }}
          <input
            v-model.number="spacing"
            type="range"
            min="0"
            max="40"
            class="accent-current text-ink-gray-7"
          />
        </label>
        <div>
          <div class="mb-2 text-sm text-ink-gray-5">{{ __('Background') }}</div>
          <div class="flex gap-2">
            <button
              v-for="color in COLORS"
              :key="color"
              class="size-7 rounded-full border border-outline-gray-2"
              :class="{ 'ring-2 ring-outline-gray-5 ring-offset-2': background === color }"
              :style="{ background: color }"
              :aria-label="color"
              @click="background = color"
            />
          </div>
        </div>
      </div>
    </div>
    <template #actions>
      <div class="flex justify-end">
        <Button variant="solid" :loading="saving" :disabled="!ready" @click="save">{{
          __('Save to Photos')
        }}</Button>
      </div>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Button, Dialog, LoadingIndicator, toast } from 'frappe-ui'

import { contentUrl } from '../resources/media'
import { getUploadFolder } from '../resources/photos'
import { uploadFile } from '../resources/drive'
import { clearSelection } from '../data/selection'
import { collage } from '../data/dialogs'
import { notifyUploaded } from '../data/uploads'

type Cell = [number, number, number, number]
interface Layout {
  ratio: number
  cells: Cell[]
}

const COLORS = ['#ffffff', '#f3f1ed', '#1f1f1f', '#e8d9c5']
const SIZE = 2400

const canvas = ref<HTMLCanvasElement>()
const ready = ref(false)
const saving = ref(false)
const layoutIndex = ref(0)
const spacing = ref(12)
const background = ref(COLORS[0])
let images: HTMLImageElement[] = []

const grid = (cols: number, rows: number, ratio = cols / rows): Layout => ({
  ratio,
  cells: Array.from({ length: cols * rows }, (_, i) => [
    (i % cols) / cols,
    Math.floor(i / cols) / rows,
    1 / cols,
    1 / rows,
  ]),
})

const layouts = computed<Layout[]>(() => {
  const n = collage.files.length
  if (n === 2)
    return [
      grid(2, 1, 1.5),
      grid(1, 2, 0.75),
      {
        ratio: 1,
        cells: [
          [0, 0, 0.62, 1],
          [0.62, 0, 0.38, 1],
        ],
      },
    ]
  if (n === 3)
    return [
      {
        ratio: 1.5,
        cells: [
          [0, 0, 0.6, 1],
          [0.6, 0, 0.4, 0.5],
          [0.6, 0.5, 0.4, 0.5],
        ],
      },
      grid(3, 1, 2),
      {
        ratio: 1,
        cells: [
          [0, 0, 1, 0.6],
          [0, 0.6, 0.5, 0.4],
          [0.5, 0.6, 0.5, 0.4],
        ],
      },
    ]
  if (n === 4)
    return [
      grid(2, 2, 1),
      {
        ratio: 1.5,
        cells: [
          [0, 0, 0.66, 1],
          [0.66, 0, 0.34, 1 / 3],
          [0.66, 1 / 3, 0.34, 1 / 3],
          [0.66, 2 / 3, 0.34, 1 / 3],
        ],
      },
      grid(4, 1, 2.5),
    ]
  if (n <= 6) return [grid(3, Math.ceil(n / 3), 1.5), grid(2, Math.ceil(n / 2), 0.8)]
  return [grid(3, Math.ceil(n / 3), 1)]
})

watch(
  () => collage.open,
  async (open) => {
    ready.value = false
    layoutIndex.value = 0
    if (!open) return
    images = await Promise.all(collage.files.map(loadImage))
    ready.value = true
    draw()
  },
)
watch([layoutIndex, spacing, background], () => ready.value && draw())

function loadImage(name: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = reject
    image.src = contentUrl(name)
  })
}

function render(target: HTMLCanvasElement, size: number) {
  const layout = layouts.value[layoutIndex.value] ?? layouts.value[0]
  const width = layout.ratio >= 1 ? size : Math.round(size * layout.ratio)
  const height = layout.ratio >= 1 ? Math.round(size / layout.ratio) : size
  target.width = width
  target.height = height
  const ctx = target.getContext('2d')!
  ctx.fillStyle = background.value
  ctx.fillRect(0, 0, width, height)
  const gap = (spacing.value / 1000) * size
  layout.cells.forEach(([x, y, w, h], index) => {
    const image = images[index % images.length]
    const cellX = gap + x * (width - gap)
    const cellY = gap + y * (height - gap)
    const cellW = Math.max(1, w * (width - gap) - gap)
    const cellH = Math.max(1, h * (height - gap) - gap)
    const scale = Math.max(cellW / image.naturalWidth, cellH / image.naturalHeight)
    const sw = cellW / scale
    const sh = cellH / scale
    ctx.drawImage(
      image,
      (image.naturalWidth - sw) / 2,
      (image.naturalHeight - sh) / 2,
      sw,
      sh,
      cellX,
      cellY,
      cellW,
      cellH,
    )
  })
}

function draw() {
  if (canvas.value) render(canvas.value, 900)
}

async function save() {
  saving.value = true
  try {
    const output = document.createElement('canvas')
    render(output, SIZE)
    const blob = await new Promise<Blob | null>((resolve) => output.toBlob(resolve, 'image/jpeg', 0.92))
    if (!blob) throw new Error(__('Could not export the collage'))
    const file = new File([blob], `Collage ${new Date().toISOString().slice(0, 10)}.jpg`, {
      type: 'image/jpeg',
    })
    await uploadFile(file, await getUploadFolder(), () => {})
    toast.success(__('Collage saved to your Photos folder'))
    collage.open = false
    clearSelection()
    notifyUploaded()
  } catch (error) {
    toast.error((error as Error).message || __('Could not save'))
  } finally {
    saving.value = false
  }
}
</script>
