<template>
  <SettingsHeader
    :title="__('Import from Google Photos')"
    :description="__('Bring your photos, videos, albums and favourites over from Google Photos.')"
  />
  <SettingsBody>
    <GooglePicker class="border-b border-outline-gray-1 pb-6 pt-2" />
    <h3 class="mt-6 text-base font-semibold text-ink-gray-8">{{ __('Import a Google Takeout export') }}</h3>
    <div v-if="takeout.uploading" class="flex flex-col gap-3 pt-2">
      <div class="text-base text-ink-gray-8">
        {{ __('Uploading {0} of {1}', [Math.min(takeout.uploaded + 1, takeout.parts), takeout.parts]) }}
      </div>
      <Progress :value="percent(takeout.bytes, takeout.totalBytes)" size="sm" />
      <div class="text-sm text-ink-gray-5">{{ __('Keep this tab open until the upload finishes.') }}</div>
    </div>

    <div v-else-if="job?.status === 'Reading'" class="flex items-center gap-2 pt-2 text-base text-ink-gray-8">
      <LoadingIndicator class="size-4" />
      {{ __('Reading your export…') }}
    </div>

    <div v-else-if="job?.status === 'Ready' && job.summary" class="flex flex-col gap-6 pt-2">
      <div class="text-base text-ink-gray-7">{{ overview }}</div>

      <RadioGroup v-model="options.mode" padded>
        <Radio value="all" :label="__('Everything')" :description="everythingText" />
        <Radio value="some" :label="__('Choose albums and years')" />
      </RadioGroup>

      <div v-if="options.mode === 'some'" class="grid gap-6 sm:grid-cols-2">
        <section v-if="albums.length">
          <h3 class="mb-2 text-base font-semibold text-ink-gray-8">{{ __('Albums') }}</h3>
          <div class="flex flex-col gap-2">
            <Checkbox
              v-for="album in albums"
              :key="album.index"
              :model-value="options.albums.includes(album.index)"
              :label="`${album.title} (${album.count})`"
              @update:model-value="toggle(options.albums, album.index, !!$event)"
            />
          </div>
        </section>
        <section>
          <h3 class="mb-2 text-base font-semibold text-ink-gray-8">{{ __('Years') }}</h3>
          <div class="flex flex-col gap-2">
            <Checkbox
              v-for="year in years"
              :key="year.year"
              :model-value="options.years.includes(year.year)"
              :label="`${year.year} (${year.count})`"
              @update:model-value="toggle(options.years, year.year, !!$event)"
            />
          </div>
        </section>
      </div>

      <div class="divide-y divide-outline-gray-1">
        <SettingsRow
          v-if="archivedCount"
          :title="__('Archived photos')"
          :description="__('{0}. They stay in Archive here too.', [countItems(archivedCount)])"
        >
          <Switch v-model="options.archived" />
        </SettingsRow>
        <SettingsRow
          :title="__('Favourites')"
          :description="__('Keep the photos you starred in Google Photos.')"
        >
          <Switch v-model="options.favourites" />
        </SettingsRow>
      </div>

      <div class="flex items-center gap-2">
        <Button variant="solid" :disabled="!selectedCount" :loading="starting" @click="start">
          {{ importLabel }}
        </Button>
        <Button variant="ghost" @click="discardImport">{{ __('Cancel') }}</Button>
      </div>
    </div>

    <div v-else-if="job?.status === 'Importing'" class="flex flex-col gap-3 pt-2">
      <div class="text-base text-ink-gray-8">
        {{ job.total ? __('Importing {0} of {1}', [job.done, job.total]) : __('Starting…') }}
      </div>
      <Progress :value="percent(job.done, job.total)" size="sm" />
      <div class="text-sm text-ink-gray-5">
        {{ __('This runs on the server. You can close this and keep using Photos.') }}
      </div>
    </div>

    <div v-else-if="job?.status === 'Done'" class="flex flex-col gap-3 pt-2">
      <div class="text-base text-ink-gray-8">{{ resultText }}</div>
      <div v-if="job.result?.skipped" class="text-base text-ink-gray-5">
        {{ __('{0} were already in Photos.', [job.result.skipped]) }}
      </div>
      <div>
        <Button @click="discardImport">{{ __('Import more') }}</Button>
      </div>
    </div>

    <div v-else class="flex flex-col gap-4 pt-2">
      <ol class="flex list-decimal flex-col gap-2 pl-5 text-base text-ink-gray-7">
        <li>
          {{ __('Open') }}
          <a
            href="https://takeout.google.com"
            target="_blank"
            rel="noopener"
            class="text-ink-gray-9 underline"
            >Google Takeout</a
          >
          {{ __('and select only Google Photos.') }}
        </li>
        <li>{{ __('Export as .zip files and download every part.') }}</li>
        <li>
          {{
            __('Pick all the parts here at once. You choose what to bring in before anything is imported.')
          }}
        </li>
      </ol>
      <ErrorMessage v-if="takeout.error || job?.error" :message="takeout.error || job?.error || undefined" />
      <div class="flex items-center gap-2">
        <Button variant="subtle" @click="pick">
          <template #prefix><LucideUpload class="size-4" /></template>
          {{ __('Choose zip files') }}
        </Button>
        <Button v-if="job?.status === 'Failed'" variant="ghost" @click="discardImport">{{
          __('Dismiss')
        }}</Button>
      </div>
    </div>
  </SettingsBody>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import {
  Button,
  Checkbox,
  ErrorMessage,
  LoadingIndicator,
  Progress,
  Radio,
  RadioGroup,
  SettingsBody,
  SettingsHeader,
  SettingsRow,
  Switch,
} from 'frappe-ui'
import LucideUpload from '~icons/lucide/upload'

import type { ImportOptions } from '../../resources/takeout'
import GooglePicker from './GooglePicker.vue'
import { discardImport, loadImport, runImport, startTakeout, takeout } from '../../data/imports'

const job = computed(() => takeout.job)
const items = computed(() => job.value?.summary?.items ?? [])
const options = reactive<ImportOptions>({
  mode: 'all',
  albums: [],
  years: [],
  archived: true,
  favourites: true,
})
const starting = ref(false)

if (!takeout.job && !takeout.uploading) loadImport()
watch(
  () => job.value?.name,
  () => Object.assign(options, { mode: 'all', albums: [], years: [], archived: true, favourites: true }),
)

const percent = (value: number, total: number) => (total ? Math.round((value / total) * 100) : 0)
const countItems = (count: number) => (count === 1 ? __('1 item') : __('{0} items', [count]))

const albums = computed(() =>
  (job.value?.summary?.albums ?? []).map((title, index) => ({
    title,
    index,
    count: items.value.filter(([albumIndexes]) => albumIndexes.includes(index)).length,
  })),
)
const years = computed(() => {
  const counts = new Map<number, number>()
  items.value.forEach(([, year]) => counts.set(year, (counts.get(year) ?? 0) + 1))
  return [...counts].sort((a, b) => b[0] - a[0]).map(([year, count]) => ({ year, count }))
})
const archivedCount = computed(() => items.value.filter(([, , archived]) => archived).length)

const selectedItems = computed(() =>
  items.value.filter(([albumIndexes, year, archived]) => {
    if (archived && !options.archived) return false
    if (options.mode === 'all') return true
    return albumIndexes.some((index) => options.albums.includes(index)) || options.years.includes(year)
  }),
)
const selectedCount = computed(() => selectedItems.value.filter(([, , , , existing]) => !existing).length)

const overview = computed(() => {
  const videos = items.value.filter(([, , , video]) => video).length
  const photos = items.value.length - videos
  const already = items.value.filter(([, , , , existing]) => existing).length
  const first = years.value[years.value.length - 1]?.year
  const last = years.value[0]?.year
  const range = first === last ? String(first ?? '') : `${first}–${last}`
  const counts = [photos === 1 ? __('1 photo') : __('{0} photos', [photos])]
  if (videos) counts.push(videos === 1 ? __('1 video') : __('{0} videos', [videos]))
  let text = __('{0} from {1}.', [counts.join(__(' and ')), range])
  if (already) text += ' ' + __('{0} are already in Photos and will be skipped.', [already])
  return text
})
const everythingText = computed(() => {
  const count = albums.value.length
  const all = countItems(items.value.length)
  return count === 1 ? __('{0} and 1 album', [all]) : __('{0} and {1} albums', [all, count])
})
const importLabel = computed(() => {
  if (selectedCount.value) return __('Import {0}', [countItems(selectedCount.value)])
  return selectedItems.value.length ? __('Already in Photos') : __('Choose what to import')
})
const resultText = computed(() => {
  const result = job.value?.result
  const imported = countItems(result?.imported ?? 0)
  if (!result?.albums) return __('Imported {0}.', [imported])
  return result.albums === 1
    ? __('Imported {0} and 1 album.', [imported])
    : __('Imported {0} and {1} albums.', [imported, result.albums])
})

function toggle(list: number[], value: number, on: boolean) {
  const index = list.indexOf(value)
  if (on && index === -1) list.push(value)
  if (!on && index !== -1) list.splice(index, 1)
}

async function start() {
  starting.value = true
  try {
    await runImport({ ...options, albums: [...options.albums], years: [...options.years] })
  } finally {
    starting.value = false
  }
}

function pick() {
  const input = document.createElement('input')
  input.type = 'file'
  input.multiple = true
  input.accept = '.zip,application/zip'
  input.onchange = () => input.files?.length && startTakeout([...input.files])
  input.click()
}
</script>
