<template>
  <Dialog v-model:open="albumPicker.open" :title="__('Add to album')" size="sm">
    <div class="-mx-2 flex max-h-80 flex-col overflow-y-auto">
      <form class="flex gap-2 p-2" @submit.prevent="create">
        <TextInput v-model="title" class="flex-1" :placeholder="__('New album title')" />
        <Button variant="solid" type="submit" :disabled="!title.trim()" :loading="busy">
          {{ __('Create') }}
        </Button>
      </form>
      <button
        v-for="album in targets"
        :key="album.name"
        class="flex items-center gap-3 rounded-lg p-2 text-left hover:bg-surface-gray-2"
        :disabled="busy"
        @click="add(album.name, album.title)"
      >
        <img
          v-if="album.cover"
          :src="thumbnailUrl(album.cover, album.name)"
          class="size-12 rounded-lg object-cover"
          alt=""
        />
        <div v-else class="size-12 rounded-lg bg-surface-gray-2" />
        <div class="min-w-0">
          <div class="truncate text-base font-medium text-ink-gray-8">
            {{ album.title }}
          </div>
          <div class="text-sm text-ink-gray-5">
            {{ itemCount(album.count) }}
          </div>
        </div>
      </button>
    </div>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Button, Dialog, TextInput, toast } from 'frappe-ui'

import { addToAlbum, createAlbum } from '../resources/albums'
import { thumbnailUrl } from '../resources/media'
import { albumPicker, albums, loadAlbums, sharedAlbums } from '../data/albums'
import { clearSelection } from '../data/selection'
import { itemCount } from '../utils'

const title = ref('')
const targets = computed(() => [
  ...albums.value,
  ...sharedAlbums.value.filter((album) => album.access?.write),
])
const busy = ref(false)

watch(
  () => albumPicker.open,
  (open) => {
    title.value = ''
    if (open) loadAlbums()
  },
)

async function create() {
  busy.value = true
  try {
    await createAlbum(title.value.trim(), albumPicker.files)
    done(title.value.trim())
  } finally {
    busy.value = false
  }
}

async function add(album: string, albumTitle: string) {
  busy.value = true
  try {
    await addToAlbum(album, albumPicker.files)
    done(albumTitle)
  } finally {
    busy.value = false
  }
}

function done(albumTitle: string) {
  toast.success(__('Added to {0}', [albumTitle]))
  albumPicker.open = false
  clearSelection()
  loadAlbums()
}
</script>
