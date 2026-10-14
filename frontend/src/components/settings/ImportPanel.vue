<template>
  <SettingsHeader
    :title="__('Import from Google Photos')"
    :description="__('Bring your photos, videos, albums and favourites over from Google Photos.')"
  />
  <SettingsBody>
    <div v-if="takeout.phase === 'idle' || takeout.phase === 'failed'" class="flex flex-col gap-4 pt-2">
      <ol class="flex list-decimal flex-col gap-2 pl-5 text-base text-ink-gray-7">
        <li>
          {{ __('Open') }}
          <a
            href="https://takeout.google.com"
            target="_blank"
            rel="noopener"
            class="text-ink-gray-9 underline"
          >
            Google Takeout
          </a>
          {{ __('and select only Google Photos.') }}
        </li>
        <li>{{ __('Export as .zip files and download every part.') }}</li>
        <li>{{ __('Pick all the parts here at once.') }}</li>
      </ol>
      <div class="text-base text-ink-gray-5">
        {{
          __(
            'Dates, locations, favourites, albums and archived photos come across. Anything already imported is skipped.',
          )
        }}
      </div>
      <ErrorMessage v-if="takeout.error" :message="takeout.error" />
      <div>
        <Button variant="solid" @click="pick">
          <template #prefix><LucideUpload class="size-4" /></template>
          {{ __('Choose zip files') }}
        </Button>
      </div>
    </div>

    <div v-else-if="takeout.phase === 'uploading'" class="flex flex-col gap-3 pt-2">
      <div class="text-base text-ink-gray-8">
        {{ __('Uploading {0} of {1}', [Math.min(takeout.uploaded + 1, takeout.parts), takeout.parts]) }}
      </div>
      <Progress :value="percent(takeout.bytes, takeout.totalBytes)" size="sm" />
      <div class="text-sm text-ink-gray-5">{{ __('Keep this tab open until the upload finishes.') }}</div>
    </div>

    <div v-else-if="takeout.phase === 'importing'" class="flex flex-col gap-3 pt-2">
      <div class="text-base text-ink-gray-8">
        {{
          takeout.total
            ? __('Importing {0} of {1}', [takeout.done, takeout.total])
            : __('Reading your export…')
        }}
      </div>
      <Progress :value="percent(takeout.done, takeout.total)" size="sm" />
      <div class="text-sm text-ink-gray-5">
        {{ __('This runs on the server. You can close this and keep using Photos.') }}
      </div>
    </div>

    <div v-else class="flex flex-col gap-3 pt-2">
      <div class="text-base text-ink-gray-8">
        {{ summary }}
      </div>
      <div v-if="takeout.result?.skipped" class="text-base text-ink-gray-5">
        {{ __('{0} were already in Photos.', [takeout.result.skipped]) }}
      </div>
      <div>
        <Button @click="takeout.phase = 'idle'">{{ __('Import more') }}</Button>
      </div>
    </div>
  </SettingsBody>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Button, ErrorMessage, Progress, SettingsBody, SettingsHeader } from 'frappe-ui'
import LucideUpload from '~icons/lucide/upload'

import { startTakeout, takeout } from '../../store'

const summary = computed(() => {
  const imported = takeout.result?.imported ?? 0
  const albums = takeout.result?.albums ?? 0
  const items = imported === 1 ? __('1 item') : __('{0} items', [imported])
  if (!albums) return __('Imported {0}.', [items])
  return albums === 1
    ? __('Imported {0} and 1 album.', [items])
    : __('Imported {0} and {1} albums.', [items, albums])
})
const percent = (value: number, total: number) => (total ? Math.round((value / total) * 100) : 0)

function pick() {
  const input = document.createElement('input')
  input.type = 'file'
  input.multiple = true
  input.accept = '.zip,application/zip'
  input.onchange = () => input.files?.length && startTakeout([...input.files])
  input.click()
}
</script>
