<template>
  <div
    v-if="show"
    class="fixed inset-x-3 bottom-24 z-30 flex items-center gap-3 rounded-2xl bg-surface-base p-3 shadow-xl ring-1 ring-black/5"
    role="note"
  >
    <img :src="photosLogo" class="size-10 shrink-0" alt="" />
    <div class="min-w-0 flex-1 text-sm text-ink-gray-7">
      <div class="text-base font-medium text-ink-gray-9">{{ __('Install Photos on your iPhone') }}</div>
      <span class="inline-flex flex-wrap items-center gap-1">
        {{ __('Tap') }}
        <LucideShare class="inline size-4 text-ink-blue-3" />
        {{ __('then Add to Home Screen.') }}
      </span>
    </div>
    <Button variant="ghost" :aria-label="__('Close')" @click="dismiss">
      <template #icon><LucideX class="size-4" /></template>
    </Button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Button } from 'frappe-ui'
import LucideShare from '~icons/lucide/share'
import LucideX from '~icons/lucide/x'

import { readString, writeString } from '@/utils/localStorage'
import photosLogo from '../assets/photos.svg'

const KEY = 'photos-install-hint'
const iPhone = /iPhone|iPad|iPod/.test(navigator.userAgent)
const installed =
  window.matchMedia('(display-mode: standalone)').matches ||
  Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
const show = ref(!import.meta.env.VITE_NATIVE && iPhone && !installed && !readString(KEY, ''))

function dismiss() {
  show.value = false
  writeString(KEY, '1')
}
</script>
