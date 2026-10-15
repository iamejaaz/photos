<template>
  <SettingsHeader
    :title="__('Backup')"
    :description="__('Photos and videos on this phone are copied to your library in the background.')"
  />
  <SettingsBody>
    <div v-if="status" class="flex flex-col gap-6 pt-2">
      <div v-if="!status.signedIn" class="text-base text-ink-gray-6">
        {{ __('Backup is connecting to your account. Open this again in a moment.') }}
      </div>
      <template v-else>
        <div
          v-if="status.permission === 'prompt' || status.permission === 'denied'"
          class="flex flex-col gap-2"
        >
          <div class="text-base text-ink-gray-7">
            {{ __('Allow Photos to see the photos on this phone to back them up.') }}
          </div>
          <div>
            <Button variant="solid" @click="allow">{{ __('Allow access') }}</Button>
          </div>
        </div>
        <div v-else-if="status.permission === 'partial'" class="text-base text-ink-gray-6">
          {{
            __(
              'Only the photos you picked are backed up. Allow all photos in Android settings to back up everything.',
            )
          }}
        </div>
        <div class="flex flex-col gap-3">
          <div class="flex items-center gap-3">
            <Avatar size="xl" :label="status.user" />
            <div class="min-w-0 flex-1">
              <div class="text-sm text-ink-gray-5">{{ __('Backing up to') }}</div>
              <div class="truncate text-base font-medium text-ink-gray-8">{{ status.user }}</div>
              <div class="truncate text-sm text-ink-gray-5">{{ hostOf(status.site) }}</div>
            </div>
          </div>
        </div>
        <div class="divide-y divide-outline-gray-1">
          <SettingsRow :title="__('Back up this phone')" :description="summary">
            <Switch :model-value="status.enabled" @update:model-value="set({ enabled: !!$event })" />
          </SettingsRow>
          <SettingsRow :title="__('Only on Wi-Fi')" :description="__('Saves mobile data.')">
            <Switch :model-value="status.wifiOnly" @update:model-value="set({ wifiOnly: !!$event })" />
          </SettingsRow>
          <SettingsRow :title="__('Include videos')">
            <Switch
              :model-value="status.includeVideos"
              @update:model-value="set({ includeVideos: !!$event })"
            />
          </SettingsRow>
        </div>
        <Progress v-if="status.running && status.total" :value="percent" size="sm" />
        <ErrorMessage v-if="status.lastError && !status.running" :message="errorText(status.lastError)" />
        <div>
          <Button :loading="status.running" :disabled="!status.enabled" @click="runNow">{{
            __('Back up now')
          }}</Button>
        </div>
        <div
          v-if="status.permission !== 'prompt' && status.permission !== 'denied'"
          class="flex flex-col gap-2"
        >
          <div class="text-base font-medium text-ink-gray-8">{{ __('Free up space') }}</div>
          <div class="text-p-base text-ink-gray-6">
            {{
              __(
                'Remove photos and videos from this phone that are already backed up. They stay in your library.',
              )
            }}
          </div>
          <div class="flex items-center gap-3">
            <Button v-if="!freeable" :loading="checking" @click="check">{{ __('Check this phone') }}</Button>
            <Button v-else-if="freeable.count" variant="solid" @click="freeUp">{{
              __('Free up {0}', [formatBytes(freeable.bytes)])
            }}</Button>
            <span v-else class="text-base text-ink-gray-6">{{
              __('Nothing to free up. Everything here is either not backed up yet or already removed.')
            }}</span>
            <span v-if="freeable?.count" class="text-base text-ink-gray-6">{{
              freeable.count === 1 ? __('1 item') : __('{0} items', [freeable.count])
            }}</span>
          </div>
        </div>
      </template>
    </div>
  </SettingsBody>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import {
  Avatar,
  Button,
  ErrorMessage,
  toast,
  Progress,
  SettingsBody,
  SettingsHeader,
  SettingsRow,
  Switch,
} from 'frappe-ui'
import dayjs from 'dayjs'

import { type BackupStatus, photosBackup } from '../../native/backup'
import { formatBytes } from '../../format'

const status = ref<BackupStatus | null>(null)
let stop: (() => void) | undefined

photosBackup().then(async ({ plugin }) => {
  status.value = await plugin.getStatus()
  const handle = await plugin.addListener('status', (next) => (status.value = next))
  stop = () => handle.remove()
})
onBeforeUnmount(() => stop?.())

const percent = computed(() =>
  status.value?.total ? Math.round((status.value.done / status.value.total) * 100) : 0,
)
const summary = computed(() => {
  const value = status.value
  if (!value?.enabled) return __('Off')
  if (value.running) return __('Backing up {0} of {1}', [value.done, value.total])
  const left = value.total - value.done
  if (left > 0) return __('{0} items waiting', [left])
  return value.lastRun
    ? __('Up to date, checked at {0}', [dayjs(value.lastRun).format('h:mm A')])
    : __('Starting…')
})

async function set(options: Partial<Pick<BackupStatus, 'enabled' | 'wifiOnly' | 'includeVideos'>>) {
  const { plugin } = await photosBackup()
  if (options.enabled && status.value?.permission === 'prompt')
    status.value = await plugin.requestPermission()
  status.value = await plugin.setOptions(options)
}

async function allow() {
  const { plugin } = await photosBackup()
  status.value = await plugin.requestPermission()
}

const hostOf = (url: string) => (url ? new URL(url).host : '')
const errorText = (error: string) =>
  /failed to connect|unable to resolve|timeout|timed out|unreachable/i.test(error)
    ? __("Can't reach {0} right now. Backup tries again by itself.", [hostOf(status.value?.site ?? '')])
    : error
const checking = ref(false)
const freeable = ref<{ count: number; bytes: number } | null>(null)

async function check() {
  checking.value = true
  try {
    const { plugin } = await photosBackup()
    freeable.value = await plugin.findFreeable()
  } catch (error) {
    toast.error((error as Error).message)
  } finally {
    checking.value = false
  }
}

async function freeUp() {
  const { plugin } = await photosBackup()
  try {
    const freed = await plugin.freeUpSpace()
    if (!freed.count) return
    toast.success(__('Freed up {0} on this phone', [formatBytes(freed.bytes)]))
    freeable.value = null
  } catch (error) {
    toast.error((error as Error).message)
  }
}

async function runNow() {
  const { plugin } = await photosBackup()
  await plugin.runNow()
}
</script>
