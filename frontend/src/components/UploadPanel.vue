<template>
  <div
    v-if="upload.open && upload.items.length"
    class="fixed right-4 z-30 w-[calc(100%-2rem)] overflow-hidden rounded-xl border bg-surface-base shadow-xl sm:right-6 sm:w-80"
    :style="{ bottom: 'calc(var(--photos-bottom-bar, 0px) + 1rem)' }"
    role="status"
    aria-live="polite"
  >
    <div class="flex items-center gap-2 py-2.5 pl-4 pr-2">
      <LoadingIndicator v-if="upload.active" class="size-4 shrink-0 text-ink-gray-6" />
      <LucideCircleCheck v-else-if="!failed" class="size-4 shrink-0 text-ink-green-3" />
      <LucideCircleAlert v-else class="size-4 shrink-0 text-ink-red-3" />
      <span class="min-w-0 flex-1 truncate text-base font-medium text-ink-gray-9">{{ title }}</span>
      <Button variant="ghost" :aria-label="expanded ? __('Hide details') : __('Show details')" @click="expanded = !expanded">
        <template #icon>
          <LucideChevronDown class="size-4 transition-transform" :class="{ 'rotate-180': !expanded }" />
        </template>
      </Button>
      <Button v-if="!upload.active" variant="ghost" :aria-label="__('Close')" @click="upload.open = false">
        <template #icon><LucideX class="size-4" /></template>
      </Button>
    </div>
    <div v-if="upload.active" class="px-4 pb-3">
      <div class="h-1 overflow-hidden rounded-full bg-surface-gray-2">
        <div class="h-full rounded-full bg-surface-gray-7 transition-all" :style="{ width: `${percent}%` }" />
      </div>
      <div class="mt-1.5 flex justify-between text-p-xs text-ink-gray-5">
        <span>{{ upload.preparing ? __('Getting ready…') : `${size(upload.bytes)} / ${size(upload.totalBytes)}` }}</span>
        <span v-if="!upload.preparing">{{ percent }}%</span>
      </div>
    </div>
    <ul v-if="expanded" class="max-h-60 overflow-y-auto border-t py-1">
      <li v-for="(item, index) in upload.items" :key="index" class="flex items-center gap-2.5 px-4 py-1.5">
        <span class="min-w-0 flex-1">
          <span class="block truncate text-p-sm text-ink-gray-8">{{ item.name }}</span>
          <span v-if="item.status === 'failed' || item.status === 'skipped'" class="block truncate text-p-xs text-ink-gray-5">
            {{ item.status === 'skipped' ? __('Already in Photos') : item.error || __('Could not upload') }}
          </span>
        </span>
        <LoadingIndicator v-if="item.status === 'uploading'" class="size-4 shrink-0 text-ink-gray-6" />
        <LucideCircleCheck v-else-if="item.status === 'done'" class="size-4 shrink-0 text-ink-green-3" />
        <LucideCircleAlert v-else-if="item.status === 'failed'" class="size-4 shrink-0 text-ink-red-3" />
        <LucideCircleMinus v-else-if="item.status === 'skipped'" class="size-4 shrink-0 text-ink-gray-4" />
        <LucideClock v-else class="size-4 shrink-0 text-ink-gray-4" />
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { Button, LoadingIndicator } from 'frappe-ui'
import LucideChevronDown from '~icons/lucide/chevron-down'
import LucideCircleAlert from '~icons/lucide/circle-alert'
import LucideCircleCheck from '~icons/lucide/circle-check'
import LucideCircleMinus from '~icons/lucide/circle-minus'
import LucideClock from '~icons/lucide/clock'
import LucideX from '~icons/lucide/x'

import { upload } from '../data/uploads'

const expanded = ref(false)
const count = (status: string) => upload.items.filter((item) => item.status === status).length
const failed = computed(() => count('failed'))
const percent = computed(() => Math.min(100, Math.round((upload.bytes / Math.max(upload.totalBytes, 1)) * 100)))

const title = computed(() => {
  const queued = upload.items.length - count('skipped')
  if (upload.active)
    return upload.preparing
      ? __('Preparing {0} items', [upload.items.length])
      : __('Uploading {0} of {1}', [Math.min(upload.done + 1, queued), queued])
  const done = count('done')
  if (failed.value) return __('{0} uploaded, {1} failed', [done, failed.value])
  if (!done) return __('Already in Photos')
  return done === 1 ? __('1 item uploaded') : __('{0} items uploaded', [done])
})

function size(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}
</script>
