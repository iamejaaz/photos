<template>
  <PhotosHeader account :title="__('Explore')" searchable hide-upload />
  <div v-if="empty" class="flex flex-col items-center justify-center gap-3 px-6 py-24 text-center">
    <div class="flex size-14 items-center justify-center rounded-full bg-surface-gray-2">
      <LucideCompass class="size-6 text-ink-gray-6" />
    </div>
    <div class="text-lg font-medium text-ink-gray-8">{{ __('Explore your photos') }}</div>
    <div class="max-w-sm text-base text-ink-gray-5">
      {{ __('Places and things show up here once your photos are added and looked at.') }}
    </div>
    <Button variant="solid" size="md" class="mt-2" @click="pickAndUpload()">
      <template #prefix><LucideUpload class="size-4" /></template>
      {{ __('Upload photos') }}
    </Button>
  </div>
  <div v-else class="flex flex-col gap-8 p-3 sm:p-5">
    <section>
      <h2 class="mb-3 text-lg font-semibold text-ink-gray-9">{{ __('Places') }}</h2>
      <div v-if="data?.places.length" class="h-80 sm:h-[420px]">
        <PlacesMap :places="allPlaces" />
      </div>
      <p v-else-if="data" class="text-base text-ink-gray-5">
        {{ __('Photos with a location show up on a map here.') }}
      </p>
      <div v-if="namedPlaces.length" class="mt-3 flex flex-wrap gap-2">
        <router-link
          v-for="place in namedPlaces"
          :key="place.place!"
          :to="{ name: 'photos-search', query: { place: place.place } }"
          class="flex items-center gap-2 rounded-full bg-surface-gray-2 py-1 pl-1 pr-3 text-sm text-ink-gray-8 hover:bg-surface-gray-3"
        >
          <img :src="thumbnailUrl(place.cover)" class="size-6 rounded-full object-cover" alt="" />
          {{ place.place }}
          <span class="text-ink-gray-5">{{ place.count }}</span>
        </router-link>
      </div>
    </section>

    <section v-if="data?.things.length">
      <h2 class="mb-3 text-lg font-semibold text-ink-gray-9">{{ __('Things') }}</h2>
      <div class="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
        <router-link
          v-for="thing in data.things"
          :key="thing.thing"
          :to="{ name: 'photos-search', query: { thing: thing.thing } }"
          class="group relative aspect-square overflow-hidden rounded-xl bg-surface-gray-2"
        >
          <img
            :src="thumbnailUrl(thing.cover)"
            class="size-full object-cover transition-transform duration-300 group-hover:scale-105"
            alt=""
          />
          <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
          <div class="absolute inset-x-3 bottom-3 text-white">
            <div class="text-base font-semibold">{{ __(thing.thing) }}</div>
            <div class="text-xs text-white/80">{{ itemCount(thing.count) }}</div>
          </div>
        </router-link>
      </div>
    </section>

    <section v-if="data?.cameras.length">
      <h2 class="mb-3 text-lg font-semibold text-ink-gray-9">{{ __('Cameras') }}</h2>
      <div class="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
        <router-link
          v-for="camera in data.cameras"
          :key="camera.camera"
          :to="{ name: 'photos-search', query: { camera: camera.camera } }"
          class="group flex flex-col gap-2"
        >
          <div class="aspect-square overflow-hidden rounded-xl bg-surface-gray-2">
            <img
              :src="thumbnailUrl(camera.cover)"
              class="size-full object-cover transition-transform duration-300 group-hover:scale-105"
              alt=""
            />
          </div>
          <div>
            <div class="truncate text-base font-medium text-ink-gray-8">{{ camera.camera }}</div>
            <div class="text-sm text-ink-gray-5">{{ itemCount(camera.count) }}</div>
          </div>
        </router-link>
      </div>
    </section>

    <section v-if="data?.videos.count">
      <h2 class="mb-3 text-lg font-semibold text-ink-gray-9">{{ __('Media types') }}</h2>
      <div class="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
        <router-link
          :to="{ name: 'photos-search', query: { q: 'videos' } }"
          class="group flex flex-col gap-2"
        >
          <div class="relative aspect-square overflow-hidden rounded-xl bg-surface-gray-2">
            <img
              v-if="data.videos.cover"
              :src="thumbnailUrl(data.videos.cover)"
              class="size-full object-cover transition-transform duration-300 group-hover:scale-105"
              alt=""
            />
            <LucidePlay class="absolute right-3 top-3 size-4 fill-white text-white drop-shadow" />
          </div>
          <div>
            <div class="text-base font-medium text-ink-gray-8">{{ __('Videos') }}</div>
            <div class="text-sm text-ink-gray-5">{{ itemCount(data.videos.count) }}</div>
          </div>
        </router-link>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { Button, usePageMeta } from 'frappe-ui'
import LucideCompass from '~icons/lucide/compass'
import LucideUpload from '~icons/lucide/upload'
import LucidePlay from '~icons/lucide/play'

import { appPageMeta } from '@/utils/documentTitle'
import { pickAndUpload } from '../data/uploads'
import { type Place, getExplore, getPlaces } from '../resources/photos'
import { thumbnailUrl } from '../resources/media'
import PhotosHeader from '../components/PhotosHeader.vue'
import PlacesMap from '../components/PlacesMap.vue'
import { itemCount } from '../utils'

const data = ref<Awaited<ReturnType<typeof getExplore>>>()
const allPlaces = ref<Place[]>([])
getExplore().then((result) => (data.value = result))
getPlaces().then((result) => (allPlaces.value = result))
const empty = computed(
  () =>
    data.value &&
    !data.value.places.length &&
    !data.value.things.length &&
    !data.value.cameras.length &&
    !data.value.videos.count,
)
const namedPlaces = computed(() => allPlaces.value.filter((place) => place.place).slice(0, 16))

usePageMeta(() => appPageMeta(__('Explore'), 'Photos'))
</script>
