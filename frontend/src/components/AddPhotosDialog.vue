<template>
  <Dialog v-model:open="open" :title="__('Add photos to {0}', [album.title])" size="4xl">
    <div class="-mx-2 h-[60vh] overflow-y-auto" @scroll="onScroll">
      <div class="grid grid-cols-4 gap-1 sm:grid-cols-6">
        <button
          v-for="photo in handle.feed.rows"
          :key="photo.name"
          class="relative aspect-square overflow-hidden bg-surface-gray-2"
          @click="toggle(photo.name)"
        >
          <img :src="thumbnailUrl(photo.name)" loading="lazy" class="size-full object-cover" alt="" />
          <div
            v-if="picked.has(photo.name)"
            class="pointer-events-none absolute inset-0 bg-surface-white/20 ring-2 ring-inset ring-outline-gray-5"
          />
          <span class="pointer-events-none absolute left-2 top-2 flex p-0.5">
            <Checkbox size="md" :model-value="picked.has(photo.name)" />
          </span>
        </button>
      </div>
      <div v-if="handle.feed.loading" class="flex justify-center py-6">
        <LoadingIndicator class="size-5" />
      </div>
    </div>
    <template #actions>
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <Button :loading="upload.active" @click="uploadFromComputer">
            <template #prefix><LucideUpload class="size-4" /></template>
            {{ __('Upload from computer') }}
          </Button>
          <span class="text-base text-ink-gray-6">{{ __('{0} selected', [picked.size]) }}</span>
        </div>
        <Button variant="solid" :disabled="!picked.size" :loading="saving" @click="save">{{
          __('Add')
        }}</Button>
      </div>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { Button, Checkbox, Dialog, LoadingIndicator, toast } from 'frappe-ui'
import LucideUpload from '~icons/lucide/upload'

import { type Album, addToAlbum, thumbnailUrl } from '../api'
import { createFeed, upload, uploadPhotos } from '../store'

const props = defineProps<{ album: Album }>()
const open = defineModel<boolean>({ default: false })
const emit = defineEmits<{ added: [] }>()

const handle = createFeed('timeline')
const picked = reactive(new Set<string>())
const saving = ref(false)

watch(open, (value) => {
  picked.clear()
  if (value && !handle.feed.loaded) handle.loadMore()
})

function toggle(name: string) {
  if (picked.has(name)) picked.delete(name)
  else picked.add(name)
}

function onScroll(event: Event) {
  const el = event.target as HTMLElement
  if (el.scrollTop + el.clientHeight > el.scrollHeight - 400) handle.loadMore()
}

function uploadFromComputer() {
  const input = document.createElement('input')
  input.type = 'file'
  input.multiple = true
  input.accept = 'image/*,video/*'
  input.onchange = async () => {
    const names = await uploadPhotos([...(input.files ?? [])], props.album.name)
    if (!names.length) return
    open.value = false
    emit('added')
  }
  input.click()
}

async function save() {
  saving.value = true
  try {
    await addToAlbum(props.album.name, [...picked])
    toast.success(__('Added to {0}', [props.album.title]))
    open.value = false
    emit('added')
  } finally {
    saving.value = false
  }
}
</script>
