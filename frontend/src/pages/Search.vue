<template>
  <PhotosHeader :title="title" searchable hide-upload />
  <form class="px-3 pt-3 sm:hidden" @submit.prevent="search">
    <TextInput v-model="query" :placeholder="__('Search people, places, things, dates')" autofocus>
      <template #prefix><LucideSearch class="size-4 text-ink-gray-5" /></template>
    </TextInput>
  </form>
  <PhotoGrid
    v-if="hasQuery"
    :handle="handle"
    :empty-icon="LucideSearchX"
    :empty-title="__('No results')"
    :empty-text="__('Try other words, a person, a place, a month like October or a year like 2025.')"
  />
  <div v-else class="flex flex-col items-center gap-2 px-6 py-24 text-center">
    <div class="text-lg font-medium text-ink-gray-8">{{ __('Search your photos') }}</div>
    <div class="max-w-sm text-base text-ink-gray-5">
      {{ __('Try a person, a place like Paris, a year, or describe the photo, like dog on the beach.') }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { TextInput, usePageMeta } from 'frappe-ui'
import LucideSearch from '~icons/lucide/search'
import LucideSearchX from '~icons/lucide/search-x'

import { appPageMeta } from '@/utils/documentTitle'
import PhotoGrid from '../components/PhotoGrid.vue'
import PhotosHeader from '../components/PhotosHeader.vue'
import { createFeed } from '../store'

const route = useRoute()
const router = useRouter()
const params = {
  thing: route.query.thing || undefined,
  search: route.query.q || undefined,
  camera: route.query.camera || undefined,
  place: route.query.place || undefined,
}
const hasQuery = Object.values(params).some(Boolean)
const handle = createFeed('timeline', params)
const query = ref(String(route.query.q || ''))

const title = computed(() => {
  if (params.camera) return __('Taken with {0}', [String(params.camera)])
  if (params.place) return String(params.place)
  if (params.thing) return String(params.thing)
  if (params.search) return __('Results for “{0}”', [String(params.search)])
  return __('Search')
})

function search() {
  if (query.value.trim()) router.push({ name: 'photos-search', query: { q: query.value.trim() } })
}

usePageMeta(() => appPageMeta(title.value, 'Photos'))
</script>
