<template>
  <PhotosHeader :title="config.title" :mode="config.mode" :hide-upload="kind !== 'favourites'">
    <template v-if="kind === 'trash'" #title>
      <h1 class="text-lg font-semibold text-ink-gray-9">{{ config.title }}</h1>
      <span class="hidden text-sm text-ink-gray-5 sm:inline">{{ __('Shared with Drive trash') }}</span>
    </template>
  </PhotosHeader>
  <PhotoGrid
    :handle="handle"
    :empty-icon="config.icon"
    :empty-title="config.emptyTitle"
    :empty-text="config.emptyText"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { usePageMeta } from 'frappe-ui'
import LucideArchive from '~icons/lucide/archive'
import LucideStar from '~icons/lucide/star'
import LucideTrash2 from '~icons/lucide/trash-2'

import { appPageMeta } from '@/utils/documentTitle'
import PhotoGrid from '../components/PhotoGrid.vue'
import PhotosHeader from '../components/PhotosHeader.vue'
import { createFeed } from '../store'

const props = defineProps<{ kind: 'favourites' | 'archive' | 'trash' }>()

const configs = {
  favourites: {
    method: 'favourites',
    mode: 'library',
    title: __('Favourites'),
    icon: LucideStar,
    emptyTitle: __('No favourites yet'),
    emptyText: __('Star a photo or video to find it here quickly. Favourites are shared with Drive.'),
  },
  archive: {
    method: 'archived',
    mode: 'archive',
    title: __('Archive'),
    icon: LucideArchive,
    emptyTitle: __('Nothing archived'),
    emptyText: __(
      'Archive photos to hide them from your timeline. They stay in Drive, in albums and in search.',
    ),
  },
  trash: {
    method: 'trash',
    mode: 'trash',
    title: __('Trash'),
    icon: LucideTrash2,
    emptyTitle: __('Trash is empty'),
    emptyText: __('Photos you move to trash show up here until you restore them or delete them forever.'),
  },
} as const

const config = computed(() => configs[props.kind])
const handle = createFeed(configs[props.kind].method)

usePageMeta(() => appPageMeta(config.value.title, 'Photos'))
</script>
