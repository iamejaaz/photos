<template>
  <SettingsHeader
    :title="__('Export')"
    :description="__('Download everything you have in Photos, ready for any other app.')"
  />
  <SettingsBody>
    <div class="flex flex-col gap-4 pt-2">
      <ul class="flex list-disc flex-col gap-2 pl-5 text-base text-ink-gray-7">
        <li>{{ __('Original quality, sorted into a folder per year.') }}</li>
        <li>{{ __('Dates and places are written into each photo, so other apps show them right.') }}</li>
        <li>{{ __('An albums.json file lists which photos are in which album.') }}</li>
      </ul>
      <div class="text-base text-ink-gray-5">
        {{ __('The zip is saved to the Photos folder in your Drive. You get a message when it is ready.') }}
      </div>
      <div>
        <Button variant="solid" @click="startExport(exportLibrary)">
          <template #prefix><LucideFileArchive class="size-4" /></template>
          {{ __('Export everything') }}
        </Button>
      </div>
    </div>
  </SettingsBody>
</template>

<script setup lang="ts">
import { Button, SettingsBody, SettingsHeader } from 'frappe-ui'
import LucideFileArchive from '~icons/lucide/file-archive'

import { exportLibrary } from '../../resources/export'
import { startExport } from '../../data/imports'
</script>
