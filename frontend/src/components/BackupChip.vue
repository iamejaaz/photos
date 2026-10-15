<template>
  <button
    v-if="status"
    class="flex items-center gap-2 rounded-full bg-surface-gray-2 px-3.5 py-2 text-base font-medium text-ink-gray-8"
    @click="openSettings('backup')"
  >
    <component :is="icon" class="size-4" />
    {{ label }}
  </button>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import LucideCloudCheck from '~icons/lucide/cloud-check'
import LucideCloudOff from '~icons/lucide/cloud-off'
import LucideCloudUpload from '~icons/lucide/cloud-upload'

import { type BackupStatus, photosBackup } from '../native/backup'
import { openSettings } from '../data/dialogs'

const status = ref<BackupStatus | null>(null)
let stop: (() => void) | null = null

photosBackup().then(async ({ plugin }) => {
  status.value = await plugin.getStatus().catch(() => null)
  const handle = await plugin.addListener('status', (value) => (status.value = value))
  stop = () => handle.remove()
})
onBeforeUnmount(() => stop?.())

const label = computed(() => {
  const value = status.value!
  if (!value.enabled) return __('Backup is off')
  if (value.permission !== 'granted' && value.permission !== 'partial') return __('Allow photo access')
  if (value.running && value.total) return __('Backing up {0} of {1}', [value.done, value.total])
  if (value.lastError) return __('Backup paused')
  return __('Backup complete')
})
const icon = computed(() => {
  const value = status.value!
  if (value.running) return LucideCloudUpload
  if (!value.enabled || value.lastError) return LucideCloudOff
  return LucideCloudCheck
})
</script>
