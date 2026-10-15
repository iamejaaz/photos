<template>
  <PhotosHeader :title="config.title" :mode="config.mode" :hide-upload="kind !== 'favourites'">
    <template v-if="kind === 'trash'" #title>
      <h1 class="text-lg font-semibold text-ink-gray-9">{{ config.title }}</h1>
      <span class="hidden text-sm text-ink-gray-5 sm:inline">{{
        __('Shared with Drive trash. Items are deleted forever after 30 days.')
      }}</span>
    </template>
  </PhotosHeader>
  <PhotoGrid
    :handle="handle"
    :empty-icon="config.icon"
    :empty-title="config.emptyTitle"
    :empty-text="config.emptyText"
    :badge="kind === 'trash' ? daysLeft : undefined"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import dayjs from 'dayjs'
import { usePageMeta } from 'frappe-ui'
import LucideArchive from '~icons/lucide/archive'
import LucideStar from '~icons/lucide/star'
import LucideTrash2 from '~icons/lucide/trash-2'

import { appPageMeta } from '@/utils/documentTitle'
import type { Photo } from '../resources/photos'
import PhotoGrid from '../components/PhotoGrid.vue'
import PhotosHeader from '../components/PhotosHeader.vue'
import { createFeed } from '../data/feed'

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
    emptyText: __('Photos you move to trash stay here for 30 days, then they are deleted forever.'),
  },
} as const

const config = computed(() => configs[props.kind])

function daysLeft(photo: Photo) {
  if (!photo.trashed_on) return undefined
  const days = 30 - dayjs().diff(dayjs(photo.trashed_on), 'day')
  return days <= 1 ? __('1 day') : __('{0} days', [days])
}
const handle = createFeed(configs[props.kind].method)

usePageMeta(() => appPageMeta(config.value.title, 'Photos'))
</script>
