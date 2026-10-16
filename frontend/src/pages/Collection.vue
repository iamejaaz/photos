<template>
  <PhotosHeader :title="config.title" :mode="config.mode" :hide-upload="kind !== 'favourites'">
    <template v-if="kind === 'trash'" #title>
      <h1 class="text-lg font-semibold text-ink-gray-9">{{ config.title }}</h1>
      <span class="hidden text-sm text-ink-gray-5 sm:inline">{{
        __('Shared with Drive trash. Items are deleted forever after 30 days.')
      }}</span>
    </template>
    <template v-if="kind === 'trash' && handle.feed.rows.length" #actions>
      <Button variant="ghost" theme="red" :loading="emptying" @click="confirmEmpty = true">
        {{ __('Empty trash') }}
      </Button>
    </template>
  </PhotosHeader>
  <Dialog
    v-model:open="confirmEmpty"
    :title="__('Empty trash?')"
    :message="__('All photos and videos in trash will be deleted forever. This cannot be undone.')"
    icon="lucide-trash-2"
    theme="red"
    size="sm"
    :actions="[{ label: __('Empty trash'), variant: 'solid', theme: 'red', onClick: emptyTrash }]"
  />
  <PhotoGrid
    :handle="handle"
    :empty-icon="config.icon"
    :empty-title="config.emptyTitle"
    :empty-text="config.emptyText"
    :badge="kind === 'trash' ? daysLeft : undefined"
  />
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import dayjs from 'dayjs'
import { Button, Dialog, call, toast, usePageMeta } from 'frappe-ui'
import LucideArchive from '~icons/lucide/archive'
import LucideStar from '~icons/lucide/star'
import LucideTrash2 from '~icons/lucide/trash-2'

import { appPageMeta } from '@/utils/documentTitle'
import type { Photo } from '../resources/photos'
import PhotoGrid from '../components/PhotoGrid.vue'
import PhotosHeader from '../components/PhotosHeader.vue'
import { errorText } from '../resources/drive'
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
const confirmEmpty = ref(false)
const emptying = ref(false)

async function emptyTrash() {
  confirmEmpty.value = false
  emptying.value = true
  try {
    const { count, queued } = (await call('photos.api.photos.empty_trash')) as {
      count: number
      queued: boolean
    }
    handle.feed.rows.splice(0)
    handle.feed.hasNext = false
    if (queued) toast.info(__('Emptying trash. {0} items are being deleted forever.', [count]))
    else toast.success(count === 1 ? __('Deleted 1 item forever') : __('Deleted {0} items forever', [count]))
  } catch (error) {
    toast.error(errorText(error) || __('Could not empty trash'))
  } finally {
    emptying.value = false
  }
}

usePageMeta(() => appPageMeta(config.value.title, 'Photos'))
</script>
