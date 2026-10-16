<template>
  <nav
    v-if="months.length > 1"
    class="sticky top-0 hidden h-[calc(100vh-3rem)] w-12 shrink-0 select-none py-6 sm:block"
    :aria-label="__('Jump to date')"
  >
    <div
      ref="track"
      class="relative h-full cursor-pointer"
      @mousemove="hoverAt($event)"
      @mouseleave="hover = null"
      @click="jumpTo(hover)"
    >
      <span
        v-for="label in yearLabels"
        :key="label.year"
        class="pointer-events-none absolute right-4 -translate-y-1/2 text-xs text-ink-gray-5"
        :style="{ top: `${label.top * 100}%` }"
      >
        {{ label.year }}
      </span>

      <div
        v-if="currentTop !== null && !hover"
        class="pointer-events-none absolute right-0 h-0.5 w-3 -translate-y-1/2 rounded-full bg-surface-gray-7 transition-[top] duration-150"
        :style="{ top: `${currentTop * 100}%` }"
      />

      <div
        v-if="hover"
        class="pointer-events-none absolute right-0 flex -translate-y-1/2 items-center"
        :style="{ top: `${hover.top * 100}%` }"
      >
        <span
          class="mr-1 whitespace-nowrap rounded-full bg-surface-gray-10 px-2 py-0.5 text-xs font-medium text-ink-base shadow"
        >
          {{
            dayjs()
              .year(hover.year)
              .month(hover.month - 1)
              .format('MMM YYYY')
          }}
        </span>
        <span class="h-0.5 w-5 rounded-full bg-surface-gray-7" />
      </div>
    </div>
  </nav>
  <div
    v-if="months.length > 1 && (visible || dragging)"
    class="fixed bottom-28 right-0 top-16 z-20 w-16 select-none sm:hidden"
    :aria-label="__('Jump to date')"
  >
    <div ref="touchTrack" class="relative h-full">
      <template v-if="dragging">
        <span
          v-for="label in yearLabels"
          :key="label.year"
          class="pointer-events-none absolute right-12 -translate-y-1/2 rounded-full bg-surface-base/90 px-1.5 text-xs font-medium text-ink-gray-7 shadow-sm"
          :style="{ top: `${label.top * 100}%` }"
        >
          {{ label.year }}
        </span>
        <span
          v-if="hover"
          class="pointer-events-none absolute right-14 -translate-y-1/2 whitespace-nowrap rounded-full bg-surface-gray-10 px-3 py-1.5 text-sm font-medium text-ink-base shadow-lg"
          :style="{ top: `${hover.top * 100}%` }"
        >
          {{ monthLabel(hover) }}
        </span>
      </template>
      <button
        class="absolute right-1 flex h-11 w-9 -translate-y-1/2 touch-none items-center justify-center rounded-full bg-surface-base text-ink-gray-7 shadow-lg ring-1 ring-black/5"
        :style="{ top: `${(dragging && hover ? hover.top : (currentTop ?? 0)) * 100}%` }"
        :aria-label="__('Drag to jump to a date')"
        @pointerdown="startDrag"
        @pointermove="dragTo"
        @pointerup="endDrag"
        @pointercancel="endDrag"
      >
        <LucideChevronsUpDown class="size-4" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import dayjs from 'dayjs'
import LucideChevronsUpDown from '~icons/lucide/chevrons-up-down'

import { type MonthCount, getMonths } from '../resources/photos'
import { gridNav } from '../data/feed'

interface Mark extends MonthCount {
  top: number
  bottom: number
}

const MIN_LABEL_GAP = 0.06

const months = ref<MonthCount[]>([])
const track = ref<HTMLElement>()
const hover = ref<Mark | null>(null)
const current = computed(() => gridNav.month)
getMonths().then((data) => (months.value = data))

const marks = computed<Mark[]>(() => {
  const weights = months.value.map((row) => Math.sqrt(row.count))
  const total = weights.reduce((sum, w) => sum + w, 0) || 1
  let offset = 0
  return months.value.map((row, index) => {
    const top = offset / total
    offset += weights[index]
    return { ...row, top, bottom: offset / total }
  })
})

const yearLabels = computed(() => {
  const labels: { year: number; top: number }[] = []
  for (const mark of marks.value) {
    if (labels.some((label) => label.year === mark.year)) continue
    const previous = labels[labels.length - 1]
    if (previous && mark.top - previous.top < MIN_LABEL_GAP) continue
    labels.push({ year: mark.year, top: Math.max(mark.top, 0.01) })
  }
  return labels
})

const currentTop = computed(() => {
  const mark = marks.value.find((m) => key(m.year, m.month) <= current.value)
  return mark ? (mark.top + mark.bottom) / 2 : null
})

const key = (year: number, month: number) => `${year}-${String(month).padStart(2, '0')}`

function hoverAt(event: MouseEvent) {
  const rect = track.value?.getBoundingClientRect()
  if (!rect) return
  const fraction = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))
  const mark = marks.value.find((m) => fraction < m.bottom) ?? marks.value[marks.value.length - 1]
  hover.value = mark ? { ...mark, top: fraction } : null
}

const monthLabel = (mark: Mark) =>
  dayjs()
    .year(mark.year)
    .month(mark.month - 1)
    .format('MMM YYYY')

const HIDE_MS = 1500
const JUMP_MS = 250
const touchTrack = ref<HTMLElement>()
const visible = ref(false)
const dragging = ref(false)
let hideTimer: ReturnType<typeof setTimeout> | undefined
let lastJump = 0
let jumped = ''

function onScroll() {
  if (dragging.value) return
  visible.value = true
  clearTimeout(hideTimer)
  hideTimer = setTimeout(() => (visible.value = false), HIDE_MS)
}
document.addEventListener('scroll', onScroll, { capture: true, passive: true })
onBeforeUnmount(() => {
  document.removeEventListener('scroll', onScroll, { capture: true })
  clearTimeout(hideTimer)
})

function markAt(clientY: number) {
  const rect = touchTrack.value?.getBoundingClientRect()
  if (!rect) return null
  const fraction = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height))
  const mark = marks.value.find((m) => fraction < m.bottom) ?? marks.value[marks.value.length - 1]
  return mark ? { ...mark, top: fraction } : null
}

function startDrag(event: PointerEvent) {
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  dragging.value = true
  clearTimeout(hideTimer)
  jumped = ''
  dragTo(event)
}

function dragTo(event: PointerEvent) {
  if (!dragging.value) return
  hover.value = markAt(event.clientY)
  const target = hover.value && key(hover.value.year, hover.value.month)
  if (target && target !== jumped && performance.now() - lastJump > JUMP_MS) {
    lastJump = performance.now()
    jumped = target
    jumpTo(hover.value)
  }
}

function endDrag() {
  if (!dragging.value) return
  if (hover.value && key(hover.value.year, hover.value.month) !== jumped) jumpTo(hover.value)
  dragging.value = false
  hover.value = null
  onScroll()
}

function jumpTo(mark: Mark | null) {
  if (!mark) return
  const target = key(mark.year, mark.month)
  const upto = months.value.reduce(
    (sum, row) => sum + (key(row.year, row.month) >= target ? row.count : 0),
    0,
  )
  gridNav.jump?.(target, upto)
}
</script>
