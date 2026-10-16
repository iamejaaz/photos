<template>
  <div
    v-if="update && !dismissed"
    class="fixed inset-x-3 bottom-24 z-30 flex items-center gap-3 rounded-2xl bg-surface-base p-3 shadow-xl ring-1 ring-black/5"
    role="note"
  >
    <img :src="photosLogo" class="size-10 shrink-0" alt="" />
    <div class="min-w-0 flex-1">
      <div class="text-base font-medium text-ink-gray-9">
        {{ __('Update available') }}
      </div>
      <div class="text-sm text-ink-gray-6">
        {{ percent === null ? __('Photos {0}', [update.version_name]) : __('Downloading {0}%', [percent]) }}
      </div>
    </div>
    <Button variant="solid" :loading="percent !== null" @click="install">{{ __('Update') }}</Button>
    <Button v-if="percent === null" variant="ghost" :aria-label="__('Later')" @click="later">
      <template #icon><LucideX class="size-4" /></template>
    </Button>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { App } from '@capacitor/app'
import { Button, call, toast } from 'frappe-ui'
import LucideX from '~icons/lucide/x'

import { readString, writeString } from '@/utils/localStorage'
import photosLogo from '../assets/photos.svg'
import { photosShell } from '../native/shell'
import { errorText } from '../resources/drive'

const SKIPPED = 'photos-update-skipped'

type AppUpdate = { version_code: number; version_name: string; url: string }

const update = ref<AppUpdate | null>(null)
const dismissed = ref(false)
const percent = ref<number | null>(null)
let stop: (() => void) | undefined

check()
onBeforeUnmount(() => stop?.())

async function check() {
  const [latest, info] = await Promise.all([
    (call('photos.api.native.app_update') as Promise<AppUpdate | null>).catch(() => null),
    App.getInfo(),
  ])
  if (!latest || latest.version_code <= Number(info.build)) return
  dismissed.value = readString(SKIPPED, '') === String(latest.version_code)
  update.value = latest
}

function later() {
  dismissed.value = true
  writeString(SKIPPED, String(update.value?.version_code))
}

async function install() {
  if (!update.value) return
  const { plugin } = await photosShell()
  const handle = await plugin.addListener('updateProgress', ({ percent: value }) => {
    percent.value = Math.max(0, value)
  })
  stop = () => handle.remove()
  percent.value = 0
  try {
    const result = await plugin.installUpdate({ url: update.value.url })
    if (result?.needsPermission)
      toast.info(__('Allow Photos to install updates, then tap Update again.'), { duration: 8000 })
  } catch (error) {
    toast.error(errorText(error) || __('The update could not be downloaded'))
  } finally {
    percent.value = null
    stop?.()
  }
}
</script>
