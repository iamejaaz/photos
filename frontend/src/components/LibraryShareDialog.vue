<template>
  <ShareDialog v-if="folder && libraryShare.open" v-model="libraryShare.open" :file="folder" />
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'

import { ShareDialog } from '@/apps/drive/sdk'
import { folderLink, getLibraryFolder } from '../resources/photos'
import { libraryShare } from '../data/dialogs'

const folder = ref<Record<string, unknown> | null>(null)

watch(
  () => libraryShare.open,
  async (open) => {
    if (!open || folder.value) return
    const library = await getLibraryFolder()
    folder.value = { ...library, file_type: 'Link', file_url: folderLink(String(library.name)) }
  },
)
</script>
