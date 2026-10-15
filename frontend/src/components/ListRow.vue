<template>
  <component
    :is="to ? RouterLink : 'button'"
    :to="to"
    :type="to ? undefined : 'button'"
    class="flex w-full items-center gap-4 py-3.5 text-left text-ink-gray-8 transition-colors active:bg-surface-gray-2"
  >
    <slot name="icon">
      <component :is="icon" v-if="icon" class="size-5 shrink-0 text-ink-gray-6" />
    </slot>
    <div class="min-w-0 flex-1">
      <div class="truncate text-base" :class="{ 'font-medium': description }">{{ label }}</div>
      <div v-if="description" class="truncate text-sm text-ink-gray-5">{{ description }}</div>
    </div>
    <LucideChevronRight v-if="chevron" class="size-4 shrink-0 text-ink-gray-4" />
  </component>
</template>

<script setup lang="ts">
import type { Component } from 'vue'
import { RouterLink, type RouteLocationRaw } from 'vue-router'
import LucideChevronRight from '~icons/lucide/chevron-right'

defineProps<{
  label: string
  description?: string
  icon?: Component
  to?: RouteLocationRaw
  chevron?: boolean
}>()
</script>
