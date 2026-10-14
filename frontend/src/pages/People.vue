<template>
  <PhotosHeader :title="__('People')" hide-upload>
    <template #actions>
      <Button variant="ghost" @click="showHidden = !showHidden">
        {{ showHidden ? __('Hide hidden people') : __('Show hidden people') }}
      </Button>
    </template>
  </PhotosHeader>
  <div v-if="data && !data.enabled" class="flex flex-col items-center gap-3 py-24 text-center">
    <div class="text-lg font-medium text-ink-gray-8">{{ __('Face grouping is off') }}</div>
    <div class="max-w-sm text-base text-ink-gray-5">
      {{ __('An administrator can turn it on with bench photos-setup --scan.') }}
    </div>
  </div>
  <div v-else class="grid grid-cols-3 gap-x-4 gap-y-6 p-3 sm:grid-cols-5 sm:p-5 lg:grid-cols-7">
    <router-link
      v-for="person in data?.people ?? []"
      :key="person.name"
      :to="{ name: 'photos-person', params: { person: person.name } }"
      class="group flex flex-col items-center gap-2 text-center"
      :class="{ 'opacity-50': person.hidden }"
    >
      <FaceAvatar
        :face="person.cover_face"
        class="aspect-square w-full max-w-36 transition-transform duration-300 group-hover:scale-105"
      />
      <div
        class="w-full truncate text-base font-medium"
        :class="person.person_name ? 'text-ink-gray-8' : 'text-ink-gray-5'"
      >
        {{ person.person_name || __('Add a name') }}
      </div>
      <div class="-mt-1.5 text-sm text-ink-gray-5">{{ itemCount(person.face_count) }}</div>
    </router-link>
  </div>
  <div
    v-if="data?.enabled && !data.people.length"
    class="flex flex-col items-center gap-3 py-24 text-center text-base text-ink-gray-5"
  >
    {{ __('People show up here once photos with faces are processed.') }}
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { Button, usePageMeta } from 'frappe-ui'

import { appPageMeta } from '@/utils/documentTitle'
import { type Person, getPeople } from '../api'
import FaceAvatar from '../components/FaceAvatar.vue'
import PhotosHeader from '../components/PhotosHeader.vue'
import { itemCount } from '../utils'

const data = ref<{ enabled: boolean; people: Person[] }>()
const showHidden = ref(false)
watch(showHidden, async (value) => (data.value = await getPeople(value)), { immediate: true })

usePageMeta(() => appPageMeta(__('People'), 'Photos'))
</script>
