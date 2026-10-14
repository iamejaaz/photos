<template>
  <ShareDialog v-if="folder && libraryShare.open" v-model="libraryShare.open" :file="folder" />
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'

import { ShareDialog } from '@/apps/drive/sdk'
import { getLibraryFolder } from '../api'
import { libraryShare } from '../store'

const folder = ref<Record<string, unknown> | null>(null)

watch(
  () => libraryShare.open,
  async (open) => {
    if (open && !folder.value) folder.value = await getLibraryFolder()
  },
)
</script>
