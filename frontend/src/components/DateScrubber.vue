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
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import dayjs from 'dayjs'

import { type MonthCount, getMonths } from '../resources/photos'
import type { FeedHandle } from '../data/feed'

interface Mark extends MonthCount {
  top: number
  bottom: number
}

const MIN_LABEL_GAP = 0.06

const props = defineProps<{ handle: FeedHandle }>()
const months = ref<MonthCount[]>([])
const track = ref<HTMLElement>()
const hover = ref<Mark | null>(null)
const current = ref('')
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

function trackScroll() {
  for (const line of document.querySelectorAll<HTMLElement>('[data-month]')) {
    if (line.getBoundingClientRect().bottom > 80) {
      current.value = line.dataset.month ?? ''
      return
    }
  }
}

onMounted(() => {
  document.addEventListener('scroll', trackScroll, { capture: true, passive: true })
  setTimeout(trackScroll, 500)
})
onBeforeUnmount(() => document.removeEventListener('scroll', trackScroll, { capture: true }))

async function jumpTo(mark: Mark | null) {
  if (!mark) return
  const targetKey = key(mark.year, mark.month)
  for (let attempt = 0; attempt < 30; attempt++) {
    const target = [...document.querySelectorAll<HTMLElement>('[data-month]')].find(
      (el) => (el.dataset.month ?? '') <= targetKey,
    )
    if (target && (target.dataset.month === targetKey || !props.handle.feed.hasNext)) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
    if (!props.handle.feed.hasNext) return
    await props.handle.loadMore()
    await nextTick()
  }
}
</script>
