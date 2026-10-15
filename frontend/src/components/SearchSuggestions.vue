<template>
  <div class="flex flex-col gap-7 px-3 py-5 sm:px-5">
    <section v-if="recent.length">
      <div class="mb-2 flex items-center justify-between">
        <h2 class="text-base font-semibold text-ink-gray-8">{{ __('Recent searches') }}</h2>
        <Button variant="ghost" size="sm" @click="clearRecent">{{ __('Clear') }}</Button>
      </div>
      <div class="flex flex-wrap gap-2">
        <router-link
          v-for="term in recent"
          :key="term"
          :to="{ name: 'photos-search', query: { q: term } }"
          class="flex items-center gap-1.5 rounded-full bg-surface-gray-2 px-3 py-1.5 text-base text-ink-gray-8"
        >
          <LucideHistory class="size-4 text-ink-gray-5" />
          {{ term }}
        </router-link>
      </div>
    </section>

    <section v-if="people.length">
      <h2 class="mb-3 text-base font-semibold text-ink-gray-8">{{ __('People') }}</h2>
      <div class="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
        <router-link
          v-for="person in people"
          :key="person.name"
          :to="{ name: 'photos-person', params: { person: person.name } }"
          class="flex w-16 shrink-0 flex-col items-center gap-1.5"
        >
          <FaceAvatar :face="person.cover_face" class="size-16" />
          <span class="w-full truncate text-center text-sm text-ink-gray-7">{{ person.person_name }}</span>
        </router-link>
      </div>
    </section>

    <section v-if="explore?.places.length">
      <h2 class="mb-3 text-base font-semibold text-ink-gray-8">{{ __('Places') }}</h2>
      <div class="flex flex-wrap gap-2">
        <router-link
          v-for="place in explore.places.slice(0, 10)"
          :key="place.place ?? ''"
          :to="{ name: 'photos-search', query: { place: place.place } }"
          class="flex items-center gap-1.5 rounded-full bg-surface-gray-2 px-3 py-1.5 text-base text-ink-gray-8"
        >
          <LucideMapPin class="size-4 text-ink-gray-5" />
          {{ place.place }}
        </router-link>
      </div>
    </section>

    <section v-if="explore?.things.length">
      <h2 class="mb-3 text-base font-semibold text-ink-gray-8">{{ __('Things') }}</h2>
      <div class="flex flex-wrap gap-2">
        <router-link
          v-for="thing in explore.things.slice(0, 12)"
          :key="thing.thing"
          :to="{ name: 'photos-search', query: { thing: thing.thing } }"
          class="rounded-full bg-surface-gray-2 px-3 py-1.5 text-base text-ink-gray-8"
        >
          {{ __(thing.thing) }}
        </router-link>
      </div>
    </section>

    <div
      v-if="loaded && !recent.length && !people.length && !explore?.places.length && !explore?.things.length"
      class="flex flex-col items-center gap-2 py-20 text-center"
    >
      <div class="text-lg font-medium text-ink-gray-8">{{ __('Search your photos') }}</div>
      <div class="max-w-sm text-base text-ink-gray-5">
        {{ __('Try a person, a place like Paris, a year, or describe the photo, like dog on the beach.') }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Button } from 'frappe-ui'
import LucideHistory from '~icons/lucide/history'
import LucideMapPin from '~icons/lucide/map-pin'

import { type Person, getPeople } from '../resources/people'
import { getExplore } from '../resources/photos'
import { clearRecentSearches, recentSearches } from '../data/search'
import FaceAvatar from './FaceAvatar.vue'

const recent = recentSearches
const people = ref<Person[]>([])
const explore = ref<Awaited<ReturnType<typeof getExplore>> | null>(null)
const loaded = ref(false)

const clearRecent = () => clearRecentSearches()

onMounted(async () => {
  const [peopleResult, exploreResult] = await Promise.allSettled([getPeople(), getExplore()])
  if (peopleResult.status === 'fulfilled')
    people.value = peopleResult.value.people.filter((person) => person.person_name).slice(0, 20)
  if (exploreResult.status === 'fulfilled') explore.value = exploreResult.value
  loaded.value = true
})
</script>
