<template>
  <PhotosHeader hide-upload>
    <template #title>
      <router-link
        :to="{ name: 'photos-folders' }"
        class="text-lg font-semibold text-ink-gray-5 hover:text-ink-gray-8"
      >
        {{ __('Folders') }}
      </router-link>
      <LucideChevronRight class="size-4 shrink-0 text-ink-gray-4" />
      <h1 class="truncate text-lg font-semibold text-ink-gray-9">{{ folder?.title }}</h1>
      <span v-if="folder" class="hidden truncate text-sm text-ink-gray-5 sm:inline">{{
        folder.owner_name
      }}</span>
    </template>
    <template #actions>
      <Button :href="`/drive/d/${props.folder}`">
        <template #prefix><LucideHardDrive class="size-4" /></template>
        {{ __('Open in Drive') }}
      </Button>
    </template>
  </PhotosHeader>
  <PhotoGrid
    :handle="handle"
    :empty-icon="LucideFolder"
    :empty-title="__('No photos in this folder')"
    :empty-text="__('Add photos to this folder in Drive and they show up here.')"
  />
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { Button, usePageMeta } from 'frappe-ui'
import LucideChevronRight from '~icons/lucide/chevron-right'
import LucideFolder from '~icons/lucide/folder'
import LucideHardDrive from '~icons/lucide/hard-drive'

import { appPageMeta } from '@/utils/documentTitle'
import { type Folder, getFolders } from '../api'
import PhotoGrid from '../components/PhotoGrid.vue'
import PhotosHeader from '../components/PhotosHeader.vue'
import { createFeed } from '../store'

const props = defineProps<{ folder: string }>()
const handle = createFeed('folder_photos', { folder: props.folder })
const folders = ref<Folder[]>([])
getFolders().then((data) => (folders.value = data))
const folder = computed(() => folders.value.find((row) => row.name === props.folder))

usePageMeta(() => appPageMeta(folder.value?.title, 'Photos'))
</script>
