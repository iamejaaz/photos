<template>
  <PhotosHeader :title="__('Recently added')" />
  <PhotoGrid
    :handle="handle"
    group-by="added"
    :empty-icon="LucideHistory"
    :empty-title="__('Nothing added yet')"
    :empty-text="__('Photos and videos you upload or import show up here, newest first.')"
  />
</template>

<script setup lang="ts">
import { onBeforeUnmount } from 'vue'
import { usePageMeta } from 'frappe-ui'
import LucideHistory from '~icons/lucide/history'

import { appPageMeta } from '@/utils/documentTitle'
import PhotoGrid from '../components/PhotoGrid.vue'
import PhotosHeader from '../components/PhotosHeader.vue'
import { createFeed, onUploaded } from '../store'

const handle = createFeed('recently_added')
onBeforeUnmount(onUploaded(() => handle.reload()))

usePageMeta(() => appPageMeta(__('Recently added'), 'Photos'))
</script>
