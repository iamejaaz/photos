<template>
  <div
    ref="container"
    class="pb-10 sm:px-5"
    :class="{ 'px-3': !square }"
    @wheel="onWheel"
    @touchstart="onPinchStart"
    @touchmove="onPinchMove"
  >
    <div :style="{ height: `${padTop}px` }" />
    <div v-for="line in visibleLines" :key="line.key" :ref="observeLine" :data-line="line.key">
      <h2
        v-if="line.month"
        class="pb-1 pt-6 text-xl font-semibold text-ink-gray-9"
        :class="{ 'px-3': square }"
      >
        {{ line.month }}
      </h2>
      <div class="flex gap-4" :data-month="line.monthKey">
        <div
          v-for="group in line.groups"
          :key="group.key"
          class="min-w-0"
          :class="{ 'flex-1': line.groups.length === 1 }"
        >
          <div class="group/day flex h-9 items-center pt-1" :class="{ 'px-3': square }">
            <button
              class="flex shrink-0 overflow-hidden transition-all duration-200"
              :class="
                selection.size
                  ? 'w-6 opacity-100'
                  : 'w-0 opacity-0 group-hover/day:w-6 group-hover/day:opacity-100'
              "
              :aria-label="__('Select all from {0}', [group.label])"
              @click.stop="toggleGroup(group)"
            >
              <Checkbox class="pointer-events-none" :model-value="isGroupSelected(group)" />
            </button>
            <span class="text-sm font-medium text-ink-gray-7">{{ group.label }}</span>
          </div>
          <div
            v-for="(row, rowIndex) in group.rows"
            :key="rowIndex"
            :class="square ? 'mb-0.5 grid gap-0.5' : 'mb-1 flex gap-1'"
            :style="
              square
                ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gridAutoFlow: 'dense' }
                : undefined
            "
          >
            <div
              v-for="tile in row"
              :key="tile.photo.name"
              class="group/tile relative shrink-0 cursor-pointer overflow-hidden bg-surface-gray-2"
              :style="
                square
                  ? { gridColumn: `span ${tile.span}`, gridRow: `span ${tile.span}`, aspectRatio: '1' }
                  : { width: `${tile.width}px`, height: `${tile.height}px` }
              "
              :data-photo="tile.photo.name"
              @click="onTileClick($event, tile.photo)"
              @pointerdown="touchSelect.onPress($event, tile.photo.name)"
              @contextmenu.prevent
            >
              <div
                class="absolute inset-0 overflow-hidden transition-[transform,border-radius] duration-200"
                :class="{ 'rounded-md': selection.has(tile.photo.name) }"
                :style="
                  selection.has(tile.photo.name) ? { transform: `scale(${selectedScale(tile)})` } : undefined
                "
              >
                <img
                  :src="thumbnailUrl(tile.photo.name, tile.photo.album, needsLarge(tile))"
                  :alt="tile.photo.file_name"
                  loading="lazy"
                  decoding="async"
                  draggable="false"
                  class="size-full select-none object-cover transition-opacity duration-300 [-webkit-touch-callout:none]"
                  :class="loadedThumbs.has(tile.photo.name) ? 'opacity-100' : 'opacity-0'"
                  @load="onThumbLoad($event, tile.photo.name)"
                />
                <div
                  class="pointer-events-none absolute inset-x-0 top-0 h-14 bg-gradient-to-b from-black/40 to-transparent transition-opacity"
                  :class="selection.size ? 'opacity-100' : 'opacity-0 group-hover/tile:opacity-100'"
                />
                <button
                  class="absolute left-2 top-2 flex size-5 items-center justify-center rounded-full transition"
                  :class="[
                    selection.has(tile.photo.name)
                      ? 'bg-surface-gray-10 text-ink-base ring-2 ring-white'
                      : 'border-2 border-white/90 text-transparent hover:bg-white/30 hover:text-white',
                    selection.size ? 'opacity-100' : 'opacity-0 group-hover/tile:opacity-100',
                  ]"
                  :aria-label="selection.has(tile.photo.name) ? __('Deselect') : __('Select')"
                  @click.stop="toggle(tile.photo, $event)"
                >
                  <LucideCheck class="size-3.5" :stroke-width="3" />
                </button>
                <div
                  v-if="isVideo(tile.photo)"
                  class="absolute right-2 top-2 flex items-center gap-1 rounded bg-black/50 px-1.5 py-0.5 text-xs font-medium text-white"
                >
                  <span v-if="tile.photo.duration">{{ formatDuration(tile.photo.duration) }}</span>
                  <LucidePlay class="size-3.5 fill-current" />
                </div>
                <span
                  v-if="badge?.(tile.photo)"
                  class="absolute bottom-2 right-2 rounded bg-black/50 px-1.5 py-0.5 text-xs font-medium text-white"
                >
                  {{ badge(tile.photo) }}
                </span>
                <LucideStar
                  v-if="tile.photo.is_favourite"
                  class="absolute bottom-2 left-2 size-4 fill-white text-white drop-shadow"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div :style="{ height: `${padBottom}px` }" />

    <div ref="sentinel" class="h-px" />
    <div v-if="handle.feed.loading" class="flex justify-center py-8">
      <LoadingIndicator class="size-5 text-ink-gray-5" />
    </div>
    <div
      v-else-if="handle.feed.loaded && !handle.feed.rows.length"
      class="flex flex-col items-center justify-center gap-3 py-24 text-center"
    >
      <div class="flex size-14 items-center justify-center rounded-full bg-surface-gray-2">
        <component :is="emptyIcon" class="size-6 text-ink-gray-6" />
      </div>
      <div class="text-lg font-medium text-ink-gray-8">{{ emptyTitle }}</div>
      <div class="max-w-sm text-base text-ink-gray-5">{{ emptyText }}</div>
      <slot name="empty-action" />
    </div>
    <ErrorMessage v-if="handle.feed.error" class="py-4 text-center" :message="handle.feed.error" />
  </div>
</template>

<script setup lang="ts">
import { type Component, computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useResizeObserver } from '@vueuse/core'
import { Checkbox, ErrorMessage, LoadingIndicator } from 'frappe-ui'
import dayjs from 'dayjs'
import LucideCheck from '~icons/lucide/check'
import LucidePlay from '~icons/lucide/play'
import LucideStar from '~icons/lucide/star'

import { type Photo, isVideo } from '../resources/photos'
import { thumbnailUrl } from '../resources/media'
import { useTouchSelect } from '../composables/useTouchSelect'
import { type FeedHandle, activeFeed, gridNav } from '../data/feed'
import { changeZoom, zoom } from '../data/prefs'
import { openLightbox } from '../data/viewer'
import { selection } from '../data/selection'

const props = defineProps<{
  handle: FeedHandle
  emptyTitle: string
  emptyText: string
  emptyIcon: Component
  groupBy?: 'taken' | 'added'
  badge?: (photo: Photo) => string | undefined
}>()

interface Tile {
  photo: Photo
  width: number
  height: number
  span?: number
}
interface Group {
  key: string
  label: string
  month: string | null
  photos: Photo[]
  rows: Tile[][]
}
interface Line {
  key: string
  month: string | null
  groups: Group[]
  packable: boolean
  monthKey: string
}

const GAP = 4
const DAY_GAP = 16
const container = ref<HTMLElement>()
const sentinel = ref<HTMLElement>()
const width = ref(0)
const loadedThumbs = new Set<string>()
let lastClicked: string | null = null

useResizeObserver(container, (entries) => {
  const next = Math.floor(entries[0].contentRect.width)
  requestAnimationFrame(() => (width.value = next))
})

const targetHeight = computed(() => (width.value < 1100 ? 180 : 220) * zoom.value)
const square = computed(() => width.value > 0 && width.value < 640)
const columns = computed(() => Math.min(8, Math.max(2, Math.round(4 / zoom.value))))

const groups = computed(() => {
  const result: Omit<Group, 'rows'>[] = []
  let previousMonth = ''
  for (const photo of props.handle.feed.rows) {
    const taken = dayjs((props.groupBy === 'added' && photo.added) || photo.taken)
    const key = taken.format('YYYY-MM-DD')
    let group = result[result.length - 1]
    if (!group || group.key !== key) {
      const month = taken.format('MMMM YYYY')
      group = {
        key,
        label: dayLabel(taken),
        month: month !== previousMonth && !isRecent(taken) ? month : null,
        photos: [],
      }
      previousMonth = month
      result.push(group)
    }
    group.photos.push(photo)
  }
  return result
})

const lines = computed<Line[]>(() => {
  const result: Line[] = []
  let used = 0
  for (const day of groups.value) {
    const { rows, open } = justify(day.photos)
    const group = { ...day, rows }
    const natural = !square.value && rows.length === 1 && open ? rowWidth(rows[0]) : null
    const current = result[result.length - 1]
    if (natural !== null && current?.packable && !day.month && used + DAY_GAP + natural <= width.value) {
      current.groups.push(group)
      used += DAY_GAP + natural
      continue
    }
    result.push({
      key: day.key,
      month: day.month,
      monthKey: day.key.slice(0, 7),
      groups: [group],
      packable: natural !== null,
    })
    used = natural ?? width.value
  }
  return result
})

function rowWidth(row: Tile[]) {
  return row.reduce((sum, tile) => sum + tile.width, 0) + GAP * (row.length - 1)
}

const flat = computed(() => props.handle.feed.rows)
const touchSelect = useTouchSelect({ names: () => flat.value.map((row) => row.name), selection })

function justify(photos: Photo[]): { rows: Tile[][]; open: boolean } {
  const available = width.value
  if (!available) return { rows: [], open: false }
  const rows: Tile[][] = []
  if (square.value) {
    const heroes = columns.value >= 3 ? Math.floor(photos.length / 6) : 0
    let used = 0
    const tiles = photos.map((photo) => {
      const hero = used < heroes && Boolean(photo.is_favourite || (isVideo(photo) && used === 0))
      if (hero) used++
      return { photo, width: 0, height: 0, span: hero ? 2 : 1 }
    })
    return { rows: [tiles], open: false }
  }
  let current: Photo[] = []
  let ratioSum = 0
  for (const photo of photos) {
    current.push(photo)
    ratioSum += ratio(photo)
    const rowWidth = ratioSum * targetHeight.value + GAP * (current.length - 1)
    if (rowWidth >= available) {
      const height = (available - GAP * (current.length - 1)) / ratioSum
      rows.push(current.map((p) => ({ photo: p, width: ratio(p) * height, height })))
      current = []
      ratioSum = 0
    }
  }
  if (current.length) {
    const height = targetHeight.value
    rows.push(current.map((p) => ({ photo: p, width: ratio(p) * height, height })))
  }
  return { rows, open: current.length > 0 }
}

function ratio(photo: Photo) {
  if (!photo.width || !photo.height) return 1
  return Math.min(2.5, Math.max(0.6, photo.width / photo.height))
}

function isRecent(date: dayjs.Dayjs) {
  return dayjs().diff(date, 'day') < 7
}

function dayLabel(date: dayjs.Dayjs) {
  const today = dayjs().startOf('day')
  const diff = today.diff(date.startOf('day'), 'day')
  if (diff === 0) return __('Today')
  if (diff === 1) return __('Yesterday')
  if (diff < 7) return date.format('dddd')
  return date.year() === today.year() ? date.format('ddd, D MMM') : date.format('ddd, D MMM YYYY')
}

function formatDuration(seconds: number) {
  const total = Math.round(seconds)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

function toggle(photo: Photo, event?: MouseEvent) {
  if (event?.shiftKey && lastClicked) {
    const names = flat.value.map((row) => row.name)
    const [a, b] = [names.indexOf(lastClicked), names.indexOf(photo.name)].sort((x, y) => x - y)
    if (a > -1) {
      names.slice(a, b + 1).forEach((name) => selection.add(name))
      lastClicked = photo.name
      return
    }
  }
  if (selection.has(photo.name)) selection.delete(photo.name)
  else selection.add(photo.name)
  lastClicked = photo.name
}

function onWheel(event: WheelEvent) {
  if (!event.ctrlKey && !event.metaKey) return
  event.preventDefault()
  changeZoom(event.deltaY < 0 ? 0.1 : -0.1)
}

let pinch: { distance: number; zoom: number } | null = null
const touchDistance = (touches: TouchList) =>
  Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY)

function onPinchStart(event: TouchEvent) {
  pinch = event.touches.length === 2 ? { distance: touchDistance(event.touches), zoom: zoom.value } : null
}

function onPinchMove(event: TouchEvent) {
  if (!pinch || event.touches.length !== 2) return
  event.preventDefault()
  const target = pinch.zoom * (touchDistance(event.touches) / pinch.distance)
  changeZoom(target - zoom.value)
}

function onTileClick(event: MouseEvent, photo: Photo) {
  if (touchSelect.takeClick()) return
  if (selection.size) return toggle(photo, event)
  openLightbox(props.handle, photo.name)
}

const LARGE_FROM = 640
const squareSize = computed(() => (width.value - 2 * (columns.value - 1)) / columns.value)

function needsLarge(tile: Tile) {
  if (isVideo(tile.photo)) return false
  const size = square.value ? squareSize.value * (tile.span ?? 1) : Math.max(tile.width, tile.height)
  return size * window.devicePixelRatio > LARGE_FROM
}

const SELECTED_MARGIN = 10

function selectedScale(tile: Tile) {
  const size = square.value ? squareSize.value * (tile.span ?? 1) : Math.min(tile.width, tile.height)
  return Math.max(0.84, 1 - (2 * SELECTED_MARGIN) / size)
}

function onThumbLoad(event: Event, name: string) {
  loadedThumbs.add(name)
  ;(event.target as HTMLElement).classList.replace('opacity-0', 'opacity-100')
}

const OVERSCAN = 1.5
const MONTH_HEADER = 56
const DAY_HEADER = 36
const measured = new Map<string, number>()
const measuredVersion = ref(0)
const view = reactive({ top: 0, height: window.innerHeight })
let measureFrame = 0

function estimate(line: Line) {
  let height = line.month ? MONTH_HEADER : 0
  let tallest = 0
  for (const group of line.groups) {
    let rows = DAY_HEADER
    if (square.value) {
      const cells = group.rows[0]?.reduce((sum, tile) => sum + (tile.span ?? 1) ** 2, 0) ?? 0
      rows += Math.ceil(cells / columns.value) * (squareSize.value + 2)
    } else rows += group.rows.reduce((sum, row) => sum + (row[0]?.height ?? 0) + GAP, 0)
    tallest = Math.max(tallest, rows)
  }
  return height + tallest
}

const offsets = computed(() => {
  void measuredVersion.value
  const result = [0]
  for (const line of lines.value)
    result.push(result[result.length - 1] + (measured.get(sizeKey(line)) ?? estimate(line)))
  return result
})

const sizeKey = (line: Line) =>
  `${width.value}:${zoom.value}:${line.key}:${line.groups.map((g) => g.photos.length).join(',')}`

function lineAt(y: number) {
  const list = offsets.value
  let low = 0
  let high = list.length - 1
  while (low < high) {
    const middle = (low + high + 1) >> 1
    if (list[middle] <= y) low = middle
    else high = middle - 1
  }
  return Math.min(low, Math.max(0, lines.value.length - 1))
}

const range = computed(() => {
  const buffer = view.height * OVERSCAN
  return [lineAt(view.top - buffer), lineAt(view.top + view.height + buffer) + 1]
})
const visibleLines = computed(() => lines.value.slice(range.value[0], range.value[1]))
const padTop = computed(() => offsets.value[range.value[0]] ?? 0)
const padBottom = computed(() => {
  const list = offsets.value
  return Math.max(0, list[list.length - 1] - (list[range.value[1]] ?? list[list.length - 1]))
})

const lineByKey = computed(() => new Map(lines.value.map((line) => [line.key, line])))
const lineObserver = new ResizeObserver((entries) => {
  let changed = false
  for (const entry of entries) {
    const key = (entry.target as HTMLElement).dataset.line
    const line = key && lineByKey.value.get(key)
    if (!line) continue
    const height = (entry.target as HTMLElement).offsetHeight
    if (height && measured.get(sizeKey(line)) !== height) {
      measured.set(sizeKey(line), height)
      changed = true
    }
  }
  if (changed && !bumpFrame)
    bumpFrame = requestAnimationFrame(() => {
      bumpFrame = 0
      measuredVersion.value++
      for (const element of observed) {
        if (element.isConnected) continue
        lineObserver.unobserve(element)
        observed.delete(element)
      }
    })
})
const observed = new Set<HTMLElement>()
let bumpFrame = 0

function observeLine(element: unknown) {
  if (!(element instanceof HTMLElement) || observed.has(element)) return
  observed.add(element)
  lineObserver.observe(element)
}

function updateView() {
  measureFrame = 0
  if (!container.value) return
  view.top = -container.value.getBoundingClientRect().top
  view.height = window.innerHeight
  if (activeFeed.value === props.handle) gridNav.month = lines.value[lineAt(view.top + 80)]?.monthKey ?? ''
}

function onScroll() {
  if (!measureFrame) measureFrame = requestAnimationFrame(updateView)
}

function scrollParent(element: HTMLElement | undefined) {
  for (let node = element?.parentElement; node; node = node.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(node).overflowY) && node.scrollHeight > node.clientHeight)
      return node
  }
  return document.scrollingElement as HTMLElement
}

async function jumpToMonth(month: string, upto = 0) {
  for (;;) {
    const index = lines.value.findIndex((line) => line.monthKey <= month)
    if (index > -1 && (lines.value[index].monthKey === month || !props.handle.feed.hasNext)) {
      if (!container.value) return
      const scroller = scrollParent(container.value)
      const gridTop = container.value.getBoundingClientRect().top - scroller.getBoundingClientRect().top
      scroller.scrollTo({ top: scroller.scrollTop + gridTop + offsets.value[index] })
      return
    }
    if (!props.handle.feed.hasNext || props.handle.feed.error) return
    const missing = upto - props.handle.feed.rows.length
    await props.handle.loadMore(missing > 0 ? Math.min(missing + 120, 5000) : undefined)
  }
}

function isGroupSelected(group: Group) {
  return group.photos.every((photo) => selection.has(photo.name))
}

function toggleGroup(group: Group) {
  const select = !isGroupSelected(group)
  group.photos.forEach((photo) => (select ? selection.add(photo.name) : selection.delete(photo.name)))
}

let observer: IntersectionObserver | null = null
onMounted(() => {
  activeFeed.value = props.handle
  gridNav.jump = jumpToMonth
  document.addEventListener('scroll', onScroll, { capture: true, passive: true })
  window.addEventListener('resize', onScroll)
  updateView()
  observer = new IntersectionObserver((entries) => entries[0].isIntersecting && props.handle.loadMore(), {
    rootMargin: '1200px',
  })
  if (sentinel.value) observer.observe(sentinel.value)
  if (!props.handle.feed.loaded) props.handle.loadMore()
})
onBeforeUnmount(() => {
  observer?.disconnect()
  lineObserver.disconnect()
  cancelAnimationFrame(bumpFrame)
  document.removeEventListener('scroll', onScroll, { capture: true })
  window.removeEventListener('resize', onScroll)
  cancelAnimationFrame(measureFrame)
  if (gridNav.jump === jumpToMonth) gridNav.jump = null
})
watch(() => lines.value.length, onScroll)

watch(
  () => props.handle.feed.loading,
  (loading) => {
    if (loading || !sentinel.value || !props.handle.feed.hasNext) return
    const rect = sentinel.value.getBoundingClientRect()
    if (rect.top < window.innerHeight + 1200) props.handle.loadMore()
  },
)
</script>
