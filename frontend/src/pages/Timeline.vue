<template>
  <PhotosHeader :title="__('Photos')" searchable>
    <template v-if="native" #title>
      <BackupChip class="sm:hidden" />
      <h1 class="truncate text-lg font-semibold text-ink-gray-9 max-sm:hidden">{{ __('Photos') }}</h1>
    </template>
  </PhotosHeader>
  <Memories />
  <div class="flex">
    <PhotoGrid
      class="min-w-0 flex-1"
      :handle="handle"
      :empty-icon="LucideImages"
      :empty-title="__('Your photos will show up here')"
      :empty-text="
        __(
          'Upload photos and videos, or add them in Drive. Every image you can see in Drive appears here, newest first.',
        )
      "
    >
      <template #empty-action>
        <Button @click="openSettings('import')">
          <template #prefix><LucideHardDriveDownload class="size-4" /></template>
          {{ __('Import from Google Photos') }}
        </Button>
      </template>
    </PhotoGrid>
    <DateScrubber />
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount } from 'vue'
import { Button, usePageMeta } from 'frappe-ui'
import LucideHardDriveDownload from '~icons/lucide/hard-drive-download'
import LucideImages from '~icons/lucide/images'

import { appPageMeta } from '@/utils/documentTitle'
import { defineAsyncComponent } from 'vue'
import DateScrubber from '../components/DateScrubber.vue'
import Memories from '../components/Memories.vue'
import PhotoGrid from '../components/PhotoGrid.vue'
import PhotosHeader from '../components/PhotosHeader.vue'
import { createFeed } from '../data/feed'
import { onUploaded } from '../data/uploads'
import { openSettings } from '../data/dialogs'

const native = Boolean(import.meta.env.VITE_NATIVE)
const BackupChip = native ? defineAsyncComponent(() => import('../components/BackupChip.vue')) : null
const handle = createFeed('timeline')
onBeforeUnmount(onUploaded(() => handle.reload()))

usePageMeta(() => appPageMeta(undefined, 'Photos'))
</script>
