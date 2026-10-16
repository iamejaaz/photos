<template>
  <div
    v-if="availableUpdate && !dismissed"
    class="fixed inset-x-3 bottom-24 z-30 flex items-center gap-3 rounded-2xl bg-surface-base p-3 shadow-xl ring-1 ring-black/5"
    role="note"
  >
    <img :src="photosLogo" class="size-10 shrink-0" alt="" />
    <div class="min-w-0 flex-1">
      <div class="text-base font-medium text-ink-gray-9">
        {{ __('Update available') }}
      </div>
      <div class="text-sm text-ink-gray-6">
        {{
          updateProgress === null
            ? __('Photos {0}', [availableUpdate.version_name])
            : __('Downloading {0}%', [updateProgress])
        }}
      </div>
    </div>
    <Button variant="solid" :loading="updateProgress !== null" @click="installUpdate">{{
      __('Update')
    }}</Button>
    <Button v-if="updateProgress === null" variant="ghost" :aria-label="__('Later')" @click="later">
      <template #icon><LucideX class="size-4" /></template>
    </Button>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { Button } from 'frappe-ui'
import LucideX from '~icons/lucide/x'

import { readString, writeString } from '@/utils/localStorage'
import photosLogo from '../assets/photos.svg'
import { availableUpdate, checkForUpdate, installUpdate, updateProgress } from '../data/appUpdate'

const SKIPPED = 'photos-update-skipped'

const skipped = ref(readString(SKIPPED, ''))
const dismissed = computed(() => skipped.value === String(availableUpdate.value?.version_code))

checkForUpdate()

function later() {
  skipped.value = String(availableUpdate.value?.version_code)
  writeString(SKIPPED, skipped.value)
}
</script>
