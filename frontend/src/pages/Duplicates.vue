<template>
  <PhotosHeader :title="__('Duplicates')" hide-upload>
    <template #actions>
      <Button v-if="groups.length" variant="solid" :loading="busy" @click="cleanAll">
        {{ __('Keep best, trash {0}', [extraCount]) }}
      </Button>
    </template>
  </PhotosHeader>
  <div v-if="loading" class="flex justify-center py-16"><LoadingIndicator class="size-5" /></div>
  <div v-else-if="!groups.length" class="flex flex-col items-center gap-3 py-24 text-center">
    <div class="flex size-14 items-center justify-center rounded-full bg-surface-gray-2">
      <LucideCopyCheck class="size-6 text-ink-gray-6" />
    </div>
    <div class="text-lg font-medium text-ink-gray-8">{{ __('No duplicates found') }}</div>
    <div class="max-w-sm text-base text-ink-gray-5">
      {{ __('Photos you uploaded more than once, or resized copies, show up here.') }}
    </div>
  </div>
  <div v-else class="flex flex-col gap-6 p-3 sm:p-5">
    <p class="text-base text-ink-gray-6">
      {{ __('These look the same. The best quality copy is kept; the rest are selected for trash.') }}
    </p>
    <section v-for="(group, index) in groups" :key="group[0].name" class="rounded-xl border p-4">
      <div class="mb-3 flex items-center justify-between">
        <span class="text-sm text-ink-gray-5">{{ dayjs(group[0].taken).format('D MMM YYYY') }}</span>
        <div class="flex gap-2">
          <Button variant="ghost" @click="dismiss(index)">{{ __('Not duplicates') }}</Button>
          <Button :disabled="!picked(group).length" @click="trashGroup(index)">
            {{ __('Trash selected') }}
          </Button>
        </div>
      </div>
      <div class="flex flex-wrap gap-3">
        <button
          v-for="(row, position) in group"
          :key="row.name"
          class="flex w-44 flex-col gap-1.5 text-left"
          @click="toggle(row.name)"
        >
          <div class="relative aspect-square overflow-hidden rounded-lg bg-surface-gray-2">
            <img :src="thumbnailUrl(row.name)" class="size-full object-cover" alt="" />
            <div
              v-if="selected.has(row.name)"
              class="pointer-events-none absolute inset-0 bg-surface-white/20 ring-2 ring-inset ring-outline-gray-5"
            />
            <span class="pointer-events-none absolute left-2 top-2 flex p-0.5">
              <Checkbox size="md" :model-value="selected.has(row.name)" />
            </span>
            <Badge
              v-if="position === 0"
              class="absolute bottom-2 left-2"
              theme="green"
              :label="__('Best quality')"
            />
          </div>
          <div class="truncate text-sm font-medium text-ink-gray-8">{{ row.file_name }}</div>
          <div class="text-xs text-ink-gray-5">
            {{ row.width && row.height ? `${row.width} × ${row.height} · ` : ''
            }}{{ formatSize(row.file_size) }}
          </div>
        </button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { Badge, Button, Checkbox, LoadingIndicator, call, toast, usePageMeta } from 'frappe-ui'
import dayjs from 'dayjs'
import LucideCopyCheck from '~icons/lucide/copy-check'

import { appPageMeta } from '@/utils/documentTitle'
import { thumbnailUrl } from '../resources/media'
import { toggleTrash } from '../resources/drive'
import PhotosHeader from '../components/PhotosHeader.vue'

interface Row {
  name: string
  file_name: string
  file_size: number
  width: number | null
  height: number | null
  taken: string
}

const groups = ref<Row[][]>([])
const loading = ref(true)
const busy = ref(false)
const selected = reactive(new Set<string>())

async function load() {
  loading.value = true
  groups.value = await call('photos.api.photos.duplicates')
  selected.clear()
  groups.value.forEach((group) => group.slice(1).forEach((row) => selected.add(row.name)))
  loading.value = false
}
load()

const extraCount = computed(() => groups.value.reduce((sum, group) => sum + group.length - 1, 0))
const picked = (group: Row[]) => group.filter((row) => selected.has(row.name)).map((row) => row.name)

function toggle(name: string) {
  if (selected.has(name)) selected.delete(name)
  else selected.add(name)
}

function dismiss(index: number) {
  groups.value[index].forEach((row) => selected.delete(row.name))
  groups.value.splice(index, 1)
}

async function trashGroup(index: number) {
  const names = picked(groups.value[index])
  await toggleTrash(names)
  toast.success(names.length === 1 ? __('Moved to trash') : __('{0} items moved to trash', [names.length]))
  groups.value.splice(index, 1)
}

async function cleanAll() {
  busy.value = true
  try {
    const names = groups.value.flatMap((group) => group.slice(1).map((row) => row.name))
    await toggleTrash(names)
    toast.success(__('{0} duplicates moved to trash', [names.length]))
    await load()
  } finally {
    busy.value = false
  }
}

function formatSize(bytes: number) {
  return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`
}

usePageMeta(() => appPageMeta(__('Duplicates'), 'Photos'))
</script>
