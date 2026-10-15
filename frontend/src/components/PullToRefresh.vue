<template>
  <div ref="anchor" class="pointer-events-none sticky top-0 z-20 h-0">
    <div
      v-show="pull > 0 || refreshing"
      class="absolute left-1/2 top-0 -ml-5 flex size-10 items-center justify-center rounded-full bg-surface-base shadow-md ring-1 ring-black/5 will-change-transform"
      :style="{
        transform: `translate3d(0, ${pull - 44}px, 0)`,
        transition: refreshing || pull === 0 ? 'transform 180ms ease-out' : 'none',
      }"
    >
      <div
        class="size-5 rounded-full border-2 border-ink-gray-7 border-t-transparent will-change-transform"
        :class="{ 'animate-spin': refreshing }"
        :style="
          refreshing
            ? undefined
            : { transform: `rotate(${pull * 4}deg)`, opacity: Math.min(1, pull / trigger) }
        "
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

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
