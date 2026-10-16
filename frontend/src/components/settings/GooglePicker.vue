<template>
  <div class="flex flex-col gap-3">
    <h3 class="text-base font-semibold text-ink-gray-8">{{ __('Pick from Google Photos') }}</h3>
    <div v-if="!status" class="h-8" />
    <template v-else-if="googleImport.running">
      <div class="text-base text-ink-gray-8">
        {{ __('Importing {0} of {1}', [googleImport.done, googleImport.total || '…']) }}
      </div>
      <Progress
        :value="googleImport.total ? Math.round((googleImport.done / googleImport.total) * 100) : 0"
        size="sm"
      />
    </template>
    <p v-else-if="!status.available && !status.connected" class="text-base text-ink-gray-6">
      {{ __('Importing from Google Photos is not set up on this site yet. Ask your administrator.') }}
    </p>
    <template v-else>
      <p class="text-base text-ink-gray-6">
        {{ __('Choose photos and videos in Google Photos and bring copies of them here.') }}
      </p>
      <div class="flex items-center gap-2">
        <Button v-if="!status.connected" variant="solid" :loading="busy" @click="connect">
          {{ __('Connect Google account') }}
        </Button>
        <template v-else>
          <Button variant="solid" :loading="googleImport.picking" @click="pick">
            {{ googleImport.picking ? __('Waiting for your picks…') : __('Choose photos') }}
          </Button>
          <Button variant="ghost" @click="disconnect">{{ __('Disconnect') }}</Button>
        </template>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, Progress, toast } from 'frappe-ui'

import {
  type GoogleStatus,
  connectGoogle,
  disconnectGoogle,
  googlePickingDone,
  googleStatus,
  importGooglePicked,
  startGooglePicking,
} from '../../resources/google'
import { googleImport } from '../../data/imports'
import { errorText } from '../../resources/drive'

const status = ref<GoogleStatus | null>(null)
const busy = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined

const refreshStatus = () => googleStatus().then((value) => (status.value = value))
const onVisible = () => document.visibilityState === 'visible' && refreshStatus()
refreshStatus()
document.addEventListener('visibilitychange', onVisible)
onBeforeUnmount(() => {
  clearTimeout(timer)
  document.removeEventListener('visibilitychange', onVisible)
})

const native = Boolean(import.meta.env.VITE_NATIVE)

const OUTCOMES: Record<string, () => void> = {
  connected: () => toast.success(__('Google account connected. Choose photos to import.')),
  cancelled: () => toast.info(__('Google sign-in was cancelled')),
  failed: () => toast.error(__('Google did not finish signing you in. Please try again.')),
  expired: () => toast.error(__('That Google sign-in took too long. Please start again.')),
}
const route = useRoute()
const router = useRouter()
const outcome = String(route.query.google ?? '')
if (OUTCOMES[outcome]) {
  OUTCOMES[outcome]()
  const { google, ...query } = route.query
  router.replace({ query })
}

async function openOutside(url: string) {
  const { photosShell } = await import('../../native/shell')
  const { plugin } = await photosShell()
  await plugin.openExternal({ url })
}

async function connect() {
  busy.value = true
  try {
    const url = await connectGoogle(native)
    if (!native) return window.location.assign(url)
    await openOutside(url)
    busy.value = false
  } catch (error) {
    busy.value = false
    toast.error(errorText(error) || __('Could not connect to Google'))
  }
}

async function disconnect() {
  await disconnectGoogle()
  await refreshStatus()
}

async function pick() {
  const picker = native ? null : window.open('', '_blank')
  try {
    const session = await startGooglePicking()
    if (native) await openOutside(session.url)
    else if (picker) picker.location.href = session.url
    else window.open(session.url, '_blank')
    googleImport.picking = true
    const deadline = Date.now() + 30 * 60_000
    const poll = async () => {
      if (Date.now() > deadline) {
        googleImport.picking = false
        return
      }
      if (await googlePickingDone(session.id).catch(() => false)) {
        googleImport.picking = false
        googleImport.running = true
        googleImport.done = 0
        googleImport.total = 0
        await importGooglePicked(session.id)
        return
      }
      timer = setTimeout(poll, Math.max(2, session.poll_seconds) * 1000)
    }
    timer = setTimeout(poll, 3000)
  } catch (error) {
    picker?.close()
    googleImport.picking = false
    toast.error(errorText(error) || __('Could not open Google Photos'))
  }
}
</script>
