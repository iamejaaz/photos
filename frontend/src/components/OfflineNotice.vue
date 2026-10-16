<template>
  <Transition
    enter-from-class="translate-y-4 opacity-0"
    leave-to-class="translate-y-4 opacity-0"
    enter-active-class="transition duration-200"
    leave-active-class="transition duration-200"
  >
    <div
      v-if="offline"
      class="pointer-events-none fixed inset-x-0 bottom-24 z-30 flex justify-center px-3"
      role="status"
    >
      <div
        class="flex items-center gap-2 rounded-full bg-surface-gray-7 px-3.5 py-2 text-sm text-ink-white shadow-lg"
      >
        <LucideCloudOff class="size-4 shrink-0" />
        {{ offline === 'network' ? __("You're offline") : __('Your site is unavailable') }}
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue'
import LucideCloudOff from '~icons/lucide/cloud-off'

import { offline } from '../native/offline'
import { notifyUploaded } from '../data/uploads'
import { memoriesVersion } from '../data/viewer'
import { retryAllImages } from '../retryImages'

const RETRY_MS = 15_000
let timer: ReturnType<typeof setInterval> | undefined

const check = () => fetch('/api/method/photos.api.native.boot').catch(() => null)

watch(
  offline,
  (now, before) => {
    clearInterval(timer)
    if (now) timer = setInterval(check, RETRY_MS)
    else if (before) {
      retryAllImages()
      notifyUploaded()
      memoriesVersion.value++
    }
  },
  { immediate: true },
)

window.addEventListener('online', check)
onBeforeUnmount(() => {
  clearInterval(timer)
  window.removeEventListener('online', check)
})
</script>
