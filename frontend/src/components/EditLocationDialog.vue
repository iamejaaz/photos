<template>
  <Dialog
    v-model:open="open"
    :title="count === 1 ? __('Edit location') : __('Edit location of {0} items', [count])"
    size="sm"
  >
    <div class="flex flex-col gap-3">
      <TextInput v-model="query" :placeholder="__('Search a city')" autofocus>
        <template #prefix><LucideSearch class="size-4 text-ink-gray-5" /></template>
      </TextInput>
      <div class="flex min-h-40 flex-col">
        <button
          v-for="place in results"
          :key="place.label + place.latitude"
          class="flex items-center gap-2 rounded px-2 py-1.5 text-left text-base text-ink-gray-8 hover:bg-surface-gray-2"
          @click="save(place)"
        >
          <LucideMapPin class="size-4 shrink-0 text-ink-gray-5" />
          {{ place.label }}
        </button>
        <div
          v-if="query.trim().length > 1 && !results.length && !searching"
          class="px-2 py-1.5 text-base text-ink-gray-5"
        >
          {{ __('No city found') }}
        </div>
      </div>
      <div class="flex items-center justify-between">
        <span class="text-sm text-ink-gray-5">{{ __('The original files stay as they are.') }}</span>
        <Button variant="ghost" theme="red" @click="save(null)">{{ __('Remove location') }}</Button>
      </div>
    </div>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Button, Dialog, TextInput, toast } from 'frappe-ui'
import { useDebounceFn } from '@vueuse/core'
import LucideMapPin from '~icons/lucide/map-pin'
import LucideSearch from '~icons/lucide/search'

import { type PlaceMatch, editLocation, searchPlaces } from '../api'
import { editing, metadataSaved } from '../store'

const open = computed({
  get: () => editing.kind === 'location',
  set: (value) => !value && (editing.kind = null),
})
const count = computed(() => editing.files.length)
const query = ref('')
const results = ref<PlaceMatch[]>([])
const searching = ref(false)

const search = useDebounceFn(async () => {
  results.value = query.value.trim().length > 1 ? await searchPlaces(query.value) : []
  searching.value = false
}, 200)
watch(query, () => {
  searching.value = true
  search()
})
watch(open, (value) => value && ((query.value = ''), (results.value = [])))

async function save(place: PlaceMatch | null) {
  try {
    await editLocation(editing.files, place)
    metadataSaved()
    toast.success(place ? __('Location set to {0}', [place.label]) : __('Location removed'))
  } catch (error) {
    toast.error((error as { messages?: string[] }).messages?.[0] ?? __('Could not update the location'))
  }
}
</script>
