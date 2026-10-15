<template>
  <PhotosHeader :title="__('Explore')" searchable hide-upload />
  <div class="flex flex-col gap-8 p-3 sm:p-5">
    <section v-if="people.length">
      <div class="mb-3 flex items-center justify-between">
        <h2 class="text-lg font-semibold text-ink-gray-9">{{ __('People') }}</h2>
        <router-link :to="{ name: 'photos-people' }" class="text-base text-ink-gray-6 hover:text-ink-gray-9">
          {{ __('View all') }}
        </router-link>
      </div>
      <div class="flex gap-4 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <router-link
          v-for="person in people.slice(0, 12)"
          :key="person.name"
          :to="{ name: 'photos-person', params: { person: person.name } }"
          class="group flex w-24 shrink-0 flex-col items-center gap-1.5 text-center"
        >
          <FaceAvatar
            :face="person.cover_face"
            class="size-24 transition-transform duration-300 group-hover:scale-105"
          />
          <span
            class="w-full truncate text-sm"
            :class="person.person_name ? 'text-ink-gray-8' : 'text-ink-gray-5'"
          >
            {{ person.person_name || __('Add a name') }}
          </span>
        </router-link>
      </div>
    </section>
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
import { usePageMeta } from 'frappe-ui'
import LucidePlay from '~icons/lucide/play'

import { appPageMeta } from '@/utils/documentTitle'
import { type Person, getPeople } from '../resources/people'
import { type Place, getExplore, getPlaces } from '../resources/photos'
import { thumbnailUrl } from '../resources/media'
import FaceAvatar from '../components/FaceAvatar.vue'
import PhotosHeader from '../components/PhotosHeader.vue'
import PlacesMap from '../components/PlacesMap.vue'
import { itemCount } from '../utils'

const data = ref<Awaited<ReturnType<typeof getExplore>>>()
const allPlaces = ref<Place[]>([])
getExplore().then((result) => (data.value = result))
getPlaces().then((result) => (allPlaces.value = result))
const namedPlaces = computed(() => allPlaces.value.filter((place) => place.place).slice(0, 16))
const people = ref<Person[]>([])
getPeople().then((result) => (people.value = result.people))

usePageMeta(() => appPageMeta(__('Explore'), 'Photos'))
</script>
