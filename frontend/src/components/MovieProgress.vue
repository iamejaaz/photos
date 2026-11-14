<template>
  <div
    v-if="list.length"
    class="fixed right-4 z-30 flex w-[calc(100%-2rem)] flex-col gap-2 sm:right-6 sm:w-80"
    :style="{ bottom }"
    role="status"
    aria-live="polite"
  >
    <div v-for="movie in list" :key="movie.id" class="overflow-hidden rounded-xl border bg-surface-base shadow-xl">
      <div class="flex items-center gap-2 py-2.5 pl-4 pr-2">
        <LoadingIndicator v-if="movie.state === 'running'" class="size-4 shrink-0 text-ink-gray-6" />
        <LucideCircleCheck v-else-if="movie.state === 'ready'" class="size-4 shrink-0 text-ink-green-3" />
        <LucideCircleAlert v-else class="size-4 shrink-0 text-ink-red-3" />
        <span class="line-clamp-2 min-w-0 flex-1 break-words text-base font-medium text-ink-gray-9">{{ heading(movie) }}</span>
        <Button v-if="movie.state === 'ready'" variant="ghost" :label="__('Open')" @click="open(movie.id)" />
        <Button v-if="movie.state !== 'running'" variant="ghost" :aria-label="__('Close')" @click="closeMovie(movie.id)">
          <template #icon><LucideX class="size-4" /></template>
        </Button>
      </div>
      <div v-if="movie.state === 'running'" class="px-4 pb-3">
        <div class="h-1 overflow-hidden rounded-full bg-surface-gray-2">
          <div
            class="h-full rounded-full bg-surface-gray-7 transition-all"
            :style="{ width: `${Math.round((movie.done / Math.max(movie.total, 1)) * 100)}%` }"
          />
        </div>
        <div class="mt-1.5 text-p-xs text-ink-gray-5">
          {{ [__('{0} of {1} photos', [movie.done, movie.total]), timeLeft(movie.left, movie.done, movie.total)].filter(Boolean).join(' · ') }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, type ComponentPublicInstance } from 'vue'
import { useRouter } from 'vue-router'
import { useElementSize } from '@vueuse/core'
import { Button, LoadingIndicator } from 'frappe-ui'
import LucideCircleAlert from '~icons/lucide/circle-alert'
import LucideCircleCheck from '~icons/lucide/circle-check'
import LucideX from '~icons/lucide/x'

import { closeMovie, movies, timeLeft, type Movie } from '../data/movies'
import { upload } from '../data/uploads'

const props = defineProps<{ uploadPanel?: ComponentPublicInstance | null }>()
const router = useRouter()
const list = computed(() => Object.values(movies))

const uploadEl = ref<HTMLElement>()
watch(
  () => [props.uploadPanel, upload.open && upload.items.length > 0],
  () => {
    const el = props.uploadPanel?.$el
    uploadEl.value = el instanceof HTMLElement ? el : undefined
  },
  { flush: 'post', immediate: true },
)
const { height } = useElementSize(uploadEl, undefined, { box: 'border-box' })
const bottom = computed(
  () => `calc(var(--photos-bottom-bar, 0px) + 1rem + ${uploadEl.value ? height.value + 8 : 0}px)`,
)

function heading(movie: Movie) {
  if (movie.state === 'ready') return __('“{0}” is ready', [movie.title])
  if (movie.state === 'failed') return __("Couldn't make “{0}”", [movie.title])
  return __('Making “{0}”', [movie.title])
}

function open(id: string) {
  closeMovie(id)
  router.push({ name: 'photos-home' })
}
</script>
