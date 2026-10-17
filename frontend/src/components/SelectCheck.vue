<template>
  <span
    class="flex size-5 items-center justify-center rounded-full transition"
    :class="
      selected
        ? ['bg-surface-gray-10 text-ink-base', { 'ring-2 ring-white': onPhoto }]
        : onPhoto
          ? 'border-2 border-white/90 text-transparent hover:bg-white/30 hover:text-white'
          : 'border-2 border-outline-gray-4 text-transparent hover:text-ink-gray-5'
    "
  >
    <LucideCheck class="size-3.5" :stroke-width="3" />
  </span>
</template>

<script setup lang="ts">
import LucideCheck from '~icons/lucide/check'

defineProps<{ selected: boolean; onPhoto?: boolean }>()
</script>
