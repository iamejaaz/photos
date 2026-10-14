<template>
  <div class="flex items-start gap-3">
    <component :is="icon" class="mt-0.5 size-5 shrink-0 text-ink-gray-5" />
    <div class="min-w-0">
      <router-link v-if="to" :to="to" class="break-words font-medium text-ink-gray-8 hover:underline">
        {{ title }}
      </router-link>
      <a
        v-else-if="href"
        :href="href"
        target="_blank"
        rel="noopener"
        class="font-medium text-ink-gray-8 hover:underline"
      >
        {{ title }}
      </a>
      <div v-else class="break-words font-medium text-ink-gray-8">
        {{ title }}
      </div>
      <div v-if="subtitle" class="text-sm text-ink-gray-5">{{ subtitle }}</div>
    </div>
    <div v-if="$slots.action" class="-my-1 ml-auto shrink-0"><slot name="action" /></div>
  </div>
</template>

<script setup lang="ts">
import type { Component } from 'vue'
import type { RouteLocationRaw } from 'vue-router'

defineProps<{
  icon: Component
  title: string
  subtitle?: string
  href?: string
  to?: RouteLocationRaw
}>()
</script>
