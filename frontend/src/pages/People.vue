<template>
  <PhotosHeader :title="__('People')" hide-upload>
    <template #actions>
      <Button v-if="data?.enabled" variant="ghost" @click="showHidden = !showHidden">
        {{ showHidden ? __('Hide hidden people') : __('Show hidden people') }}
      </Button>
    </template>
  </PhotosHeader>
  <div v-if="data && !data.enabled" class="flex flex-col items-center gap-3 py-24 text-center">
    <div class="text-lg font-medium text-ink-gray-8">{{ __('People is off') }}</div>
    <div class="max-w-sm text-base text-ink-gray-5">
      {{
        settings.data?.can_manage
          ? __('Turn it on to group photos and videos by the faces in them.')
          : __('Ask an administrator to turn on People in Photos settings.')
      }}
    </div>
    <Button v-if="settings.data?.can_manage" variant="solid" @click="openSettings('features')">
      {{ __('Open settings') }}
    </Button>
  </div>
  <div
    v-if="suggestion && data?.enabled"
    class="mx-3 mt-3 flex flex-col items-center gap-3 rounded-2xl bg-surface-gray-2 p-4 sm:mx-5 sm:mt-5 sm:flex-row sm:gap-5"
  >
    <div class="flex items-center gap-2">
      <FaceAvatar :face="suggestion.first.cover_face" class="size-16" />
      <FaceAvatar :face="suggestion.second.cover_face" class="size-16" />
    </div>
    <div class="flex-1 text-center sm:text-left">
      <div class="text-base font-semibold text-ink-gray-9">{{ __('Same or different?') }}</div>
      <div class="text-sm text-ink-gray-6">
        {{ __('These look like the same person. Merging puts all their photos together.') }}
      </div>
    </div>
    <div class="flex gap-2">
      <Button :loading="answering" @click="answer(false)">{{ __('Different') }}</Button>
      <Button variant="solid" :loading="answering" @click="answer(true)">{{ __('Same person') }}</Button>
    </div>
  </div>
  <div
    v-if="!data || data.enabled"
    class="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-x-3 gap-y-5 p-3 sm:p-5"
  >
    <router-link
      v-for="person in data?.people ?? []"
      :key="person.name"
      :to="{ name: 'photos-person', params: { person: person.name } }"
      class="group flex flex-col items-center gap-2 text-center"
      :class="{ 'opacity-50': person.hidden }"
    >
      <FaceAvatar
        :face="person.cover_face"
        class="size-20 transition-transform duration-300 group-hover:scale-105 sm:size-24"
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
import { computed, ref, watch } from 'vue'
import { Button, toast, usePageMeta } from 'frappe-ui'

import { appPageMeta } from '@/utils/documentTitle'
import { type Person, getPeople, mergePeople, mergeSuggestions, notSamePeople } from '../resources/people'
import FaceAvatar from '../components/FaceAvatar.vue'
import PhotosHeader from '../components/PhotosHeader.vue'
import { openSettings, settings } from '../data/dialogs'
import { itemCount } from '../utils'

const data = ref<{ enabled: boolean; people: Person[] }>()
const showHidden = ref(false)
const suggestions = ref<Awaited<ReturnType<typeof mergeSuggestions>>>([])
const suggestion = computed(() => suggestions.value[0])
const answering = ref(false)

async function load() {
  data.value = await getPeople(showHidden.value)
  suggestions.value = data.value.enabled ? await mergeSuggestions().catch(() => []) : []
}
watch([showHidden, () => settings.data?.people, () => settings.data?.status], load, { immediate: true })

async function answer(same: boolean) {
  const pair = suggestion.value
  if (!pair) return
  answering.value = true
  try {
    if (same) {
      const keepSecond =
        Boolean(pair.second.person_name) !== Boolean(pair.first.person_name)
          ? Boolean(pair.second.person_name)
          : pair.second.face_count > pair.first.face_count
      const [target, source] = keepSecond ? [pair.second, pair.first] : [pair.first, pair.second]
      await mergePeople(target.name, [source.name])
      toast.success(__('Merged'))
    } else await notSamePeople(pair.first.name, pair.second.name)
    await load()
  } finally {
    answering.value = false
  }
}

usePageMeta(() => appPageMeta(__('People'), 'Photos'))
</script>
