<template>
  <div
    v-if="show"
    class="fixed inset-x-3 bottom-24 z-30 flex items-center gap-3 rounded-2xl bg-surface-base p-3 shadow-xl ring-1 ring-black/5"
    role="note"
  >
    <img :src="photosLogo" class="size-10 shrink-0" alt="" />
    <div class="min-w-0 flex-1 text-base font-medium text-ink-gray-9">{{ __('Open in the Photos app') }}</div>
    <Button variant="solid" @click="open">{{ __('Open') }}</Button>
    <Button variant="ghost" :aria-label="__('Close')" @click="dismiss">
      <template #icon><LucideX class="size-4" /></template>
    </Button>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { Button } from 'frappe-ui'
import LucideX from '~icons/lucide/x'

import { readString, writeString } from '@/utils/localStorage'
import photosLogo from '../assets/photos.svg'

const KEY = 'photos-open-in-app'
const route = useRoute()
const show = ref(!import.meta.env.VITE_NATIVE && /Android/.test(navigator.userAgent) && !readString(KEY, ''))

const appLink = computed(() => {
  const link = new URL(route.fullPath, window.location.origin)
  link.searchParams.set('site', window.location.origin)
  const fallback = encodeURIComponent(window.location.href)
  return `intent://open${link.pathname}${link.search}#Intent;scheme=io.frappe.photos;package=io.frappe.photos;S.browser_fallback_url=${fallback};end`
})

function open() {
  window.location.href = appLink.value
}

function dismiss() {
  show.value = false
  writeString(KEY, '1')
}
</script>
