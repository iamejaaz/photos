<template>
  <PhotosHeader :title="__('Photos')" searchable />
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
    />
    <DateScrubber :handle="handle" />
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount } from 'vue'
import { usePageMeta } from 'frappe-ui'
import LucideImages from '~icons/lucide/images'

import { appPageMeta } from '@/utils/documentTitle'
import DateScrubber from '../components/DateScrubber.vue'
import Memories from '../components/Memories.vue'
import PhotoGrid from '../components/PhotoGrid.vue'
import PhotosHeader from '../components/PhotosHeader.vue'
import { createFeed, onUploaded } from '../store'

const handle = createFeed('timeline')
onBeforeUnmount(onUploaded(() => handle.reload()))

usePageMeta(() => appPageMeta(undefined, 'Photos'))
</script>
