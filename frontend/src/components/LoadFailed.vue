<template>
  <div class="flex flex-col items-center justify-center gap-3 py-24 text-center">
    <div class="flex size-14 items-center justify-center rounded-full bg-surface-gray-2">
      <LucideCloudOff class="size-6 text-ink-gray-6" />
    </div>
    <div class="text-lg font-medium text-ink-gray-8">{{ title || __("Couldn't load this") }}</div>
    <div class="max-w-sm text-base text-ink-gray-5">{{ __('Check your connection and try again.') }}</div>
    <Button variant="subtle" size="md" :loading="retrying" @click="emit('retry')">{{ __('Try again') }}</Button>
  </div>
</template>

<script setup lang="ts">
import { Button } from 'frappe-ui'
import LucideCloudOff from '~icons/lucide/cloud-off'

defineProps<{ title?: string; retrying?: boolean }>()
const emit = defineEmits<{ retry: [] }>()
</script>
