<template>
  <PhotosHeader :title="__('Photos')" searchable>
    <template v-if="native" #title>
      <BackupChip class="sm:hidden" />
      <h1 class="truncate text-lg font-semibold text-ink-gray-9 max-sm:hidden">{{ __('Photos') }}</h1>
    </template>
  </PhotosHeader>
  <div class="flex">
    <div class="min-w-0 flex-1">
      <Memories />
      <PhotoGrid
        :handle="handle"
        month-headers
        :empty-icon="LucideImages"
        :empty-title="__('Welcome to Photos')"
        :empty-text="
          __(
            'Bring your photos and videos here. They stay private to you until you share them, and people, places and things are found for you.',
          )
        "
      >
        <template #empty-action>
          <div class="mt-2 flex flex-col items-center gap-3">
            <div class="flex flex-wrap justify-center gap-2">
              <Button v-if="native" variant="solid" size="md" @click="openSettings('backup')">
                <template #prefix><LucideCloudUpload class="size-4" /></template>
                {{ __('Back up this phone') }}
              </Button>
              <Button :variant="native ? 'subtle' : 'solid'" size="md" @click="pickAndUpload()">
                <template #prefix><LucideUpload class="size-4" /></template>
                {{ __('Upload photos') }}
              </Button>
              <Button variant="subtle" size="md" @click="openSettings('import')">
                <template #prefix><LucideHardDriveDownload class="size-4" /></template>
                {{ __('Import from Google Photos') }}
              </Button>
            </div>
            <div v-if="!native" class="text-sm text-ink-gray-5 max-sm:hidden">
              {{ __('You can also drop photos anywhere on this page.') }}
            </div>
          </div>
        </template>
      </PhotoGrid>
    </div>
    <DateScrubber />
  </div>
</template>

<script setup lang="ts">
import { onActivated, onBeforeUnmount } from 'vue'
import { Button, usePageMeta } from 'frappe-ui'
import LucideCloudUpload from '~icons/lucide/cloud-upload'
import LucideHardDriveDownload from '~icons/lucide/hard-drive-download'
import LucideUpload from '~icons/lucide/upload'
import LucideImages from '~icons/lucide/images'

import { appPageMeta } from '@/utils/documentTitle'
import { defineAsyncComponent } from 'vue'
import DateScrubber from '../components/DateScrubber.vue'
import Memories from '../components/Memories.vue'
import PhotoGrid from '../components/PhotoGrid.vue'
import PhotosHeader from '../components/PhotosHeader.vue'
import { createFeed } from '../data/feed'
import { onUploaded, pickAndUpload } from '../data/uploads'
import { openSettings } from '../data/dialogs'

const native = Boolean(import.meta.env.VITE_NATIVE)
const BackupChip = native ? defineAsyncComponent(() => import('../components/BackupChip.vue')) : null
const handle = createFeed('timeline')
onBeforeUnmount(onUploaded(() => handle.reload()))

usePageMeta(() => appPageMeta(undefined, 'Photos'))
onActivated(() => {
  const title = appPageMeta(undefined, 'Photos').title
  if (title) document.title = title
})
</script>
