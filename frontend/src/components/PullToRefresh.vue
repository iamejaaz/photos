<template>
  <div ref="anchor" class="pointer-events-none sticky top-0 z-20 h-0">
    <div
      v-show="pull > 0 || refreshing"
      class="absolute left-1/2 flex size-10 -translate-x-1/2 items-center justify-center rounded-full bg-surface-base shadow-md ring-1 ring-black/5"
      :style="{ top: `${pull - 44}px`, transition: refreshing || pull === 0 ? 'top 150ms ease-out' : 'none' }"
    >
      <LucideRefreshCw
        class="size-5 text-ink-gray-7"
        :class="{ 'animate-spin': refreshing }"
        :style="
          refreshing
            ? undefined
            : { transform: `rotate(${pull * 3}deg)`, opacity: Math.min(1, pull / trigger) }
        "
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import LucideRefreshCw from '~icons/lucide/refresh-cw'

import { usePullToRefresh } from '../composables/usePullToRefresh'
import { lightbox, memoriesVersion, memoryStory, notifyUploaded, selection } from '../store'

const anchor = ref<HTMLElement>()

const { pull, refreshing, trigger } = usePullToRefresh(
  () => anchor.value?.closest('[data-slot="mobile-shell-scroll"]') as HTMLElement | null,
  async () => {
    notifyUploaded()
    memoriesVersion.value++
    if (import.meta.env.VITE_NATIVE) {
      const { photosBackup } = await import('../native/backup')
      const { plugin } = await photosBackup()
      await plugin.runNow().catch(() => {})
    }
  },
  () =>
    lightbox.open ||
    memoryStory.open ||
    selection.size > 0 ||
    Boolean(document.querySelector('[role="dialog"][data-state="open"]')),
)
</script>
