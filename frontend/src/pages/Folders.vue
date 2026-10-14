<template>
  <PhotosHeader :title="__('Folders')" hide-upload />
  <p class="px-3 pt-4 text-base text-ink-gray-6 sm:px-5">
    {{ __('Drive folders that have photos or videos, including folders people shared with you.') }}
  </p>
  <div class="grid grid-cols-2 gap-x-4 gap-y-6 p-3 sm:grid-cols-3 sm:p-5 lg:grid-cols-4 xl:grid-cols-5">
    <router-link
      v-for="folder in folders"
      :key="folder.name"
      :to="{ name: 'photos-folder', params: { folder: folder.name } }"
      class="group flex flex-col gap-2"
    >
      <div class="relative aspect-square overflow-hidden rounded-xl bg-surface-gray-2">
        <img
          v-if="folder.cover"
          :src="thumbnailUrl(folder.cover)"
          class="size-full object-cover transition-transform duration-300 group-hover:scale-105"
          alt=""
        />
        <div
          class="absolute left-2 top-2 flex size-7 items-center justify-center rounded-full bg-black/50 text-white"
        >
          <LucideFolder class="size-3.5" />
        </div>
      </div>
      <div>
        <div class="truncate text-base font-medium text-ink-gray-8">{{ folder.title }}</div>
        <div class="truncate text-sm text-ink-gray-5">
          {{ folder.owner_name }} · {{ itemCount(folder.count) }}
        </div>
      </div>
    </router-link>
  </div>
  <div v-if="loaded && !folders.length" class="py-24 text-center text-base text-ink-gray-5">
    {{ __('No Drive folders with photos yet.') }}
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { usePageMeta } from 'frappe-ui'
import LucideFolder from '~icons/lucide/folder'

import { appPageMeta } from '@/utils/documentTitle'
import { type Folder, getFolders, thumbnailUrl } from '../api'
import PhotosHeader from '../components/PhotosHeader.vue'
import { itemCount } from '../utils'

const folders = ref<Folder[]>([])
const loaded = ref(false)
getFolders().then((data) => {
  folders.value = data
  loaded.value = true
})

usePageMeta(() => appPageMeta(__('Folders'), 'Photos'))
</script>
