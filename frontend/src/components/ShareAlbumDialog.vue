<template>
  <ShareDialog v-if="open && file" v-model="open" :file="file" @success="emit('changed')" />
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'

import { ShareDialog, getFileForDoc } from '@/apps/drive/sdk'
import type { Album } from '../resources/albums'

const props = defineProps<{ album: Album }>()
const open = defineModel<boolean>({ default: false })
const emit = defineEmits<{ changed: [] }>()
const file = ref<Record<string, unknown> | null>(null)

watch(
  open,
  async (value) => {
    if (value) file.value = await getFileForDoc('Photo Album', props.album.name)
  },
  { immediate: true },
)
</script>
